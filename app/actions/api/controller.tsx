import { randomUUID } from 'node:crypto'

import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { inList } from 'remix/data-table/operators'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { stickers, surfaces, surfaceImages, users } from '../../data/schema.ts'
import type { SurfaceImage } from '../../data/schema.ts'
import { generateContentSlug } from '../../data/slug.ts'
import {
  ProcessImageError,
  processStickerUpload,
  processSurfaceUpload,
} from '../../data/upload-image.ts'
import { uploadStorage } from '../../data/uploads.ts'
import {
  stickerNameSchema,
  surfaceDescriptionSchema,
  surfaceNameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { readUploadFormData } from '../../utils/upload.ts'
import { jsonError, jsonOk } from './json.ts'
import {
  serializeSticker,
  serializeSurface,
  serializeSurfaceImage,
  serializeUser,
  serializeUserStub,
} from './serializers.ts'

const apiStickerCreateSchema = f.object({
  name: f.field(stickerNameSchema),
  image: f.file(
    s.instanceof_(File).refine((file) => file.size > 0, 'Please attach an image'),
  ),
})

const apiSurfaceCreateSchema = f.object({
  name: f.field(surfaceNameSchema),
  description: f.field(s.optional(surfaceDescriptionSchema)),
})

const MAX_GALLERY_FILES = 8
const MAX_TOTAL_BYTES = 88 * 1024 * 1024 // 8 files × ~11 MB each

const PAGE_SIZE = 50

function readPage(url: URL): number {
  const raw = url.searchParams.get('page') ?? '0'
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

async function safeRemoveStoredUpload(url: string | null | undefined) {
  if (!url || !url.startsWith('/uploads/')) return
  const key = url.slice('/uploads/'.length)
  try {
    await uploadStorage.remove(key)
  } catch {
    // ignore
  }
}

export default createController(routes.api, {
  actions: {
    // -------- /api/me --------
    me(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')
      // getCurrentUser returns AuthedUser which already includes the fields we need.
      return jsonOk({ user: serializeUser(user as never) })
    },

    // -------- GET /api/stickers --------
    async stickersIndex(context) {
      const db = context.get(Database)
      const page = readPage(context.url)
      const rows = await db.findMany(stickers, {
        orderBy: ['created_at', 'desc'],
        limit: PAGE_SIZE + 1,
        offset: page * PAGE_SIZE,
      })
      const hasMore = rows.length > PAGE_SIZE
      const slice = rows.slice(0, PAGE_SIZE)
      const ownerIds = Array.from(
        new Set(slice.map((s) => s.owner_id).filter((id): id is string => !!id)),
      )
      const ownerRows = ownerIds.length
        ? await db.findMany(users, { where: inList('id', ownerIds) })
        : []
      const ownerById = new Map(ownerRows.map((u) => [u.id, u]))
      return jsonOk({
        stickers: slice.map((s) => {
          const owner = s.owner_id ? ownerById.get(s.owner_id) ?? null : null
          return serializeSticker(s, owner)
        }),
        page,
        has_more: hasMore,
      })
    },

    // -------- GET /api/stickers/:id --------
    async stickerShow(context) {
      const db = context.get(Database)
      const sticker = await db.findOne(stickers, { where: { id: context.params.id } })
      if (!sticker) return jsonError(404, 'Not Found')
      let owner = null
      if (sticker.owner_id) {
        owner = (await db.findOne(users, { where: { id: sticker.owner_id } })) ?? null
      }
      return jsonOk({ sticker: serializeSticker(sticker, owner) })
    },

    // -------- POST /api/stickers --------
    async stickerCreate(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const uploadParsed = await readUploadFormData(context.request)
      if (!uploadParsed.success) {
        return jsonError(uploadParsed.error.status, uploadParsed.error.code, {
          message: uploadParsed.error.message,
          ...uploadParsed.error.extras,
        })
      }

      const parsed = s.parseSafe(apiStickerCreateSchema, uploadParsed.value)
      if (!parsed.success) {
        return jsonError(400, 'Validation failed', { issues: parsed.issues })
      }
      const { name, image } = parsed.value

      let storedImageUrl: string
      try {
        storedImageUrl = await processStickerUpload(image)
      } catch (error) {
        if (error instanceof ProcessImageError) {
          const status = error.code === 'file_too_large' ? 413 : 400
          return jsonError(status, error.code, { message: error.message })
        }
        return jsonError(400, 'upload_failed', {
          message: error instanceof Error ? error.message : 'Upload failed',
        })
      }

      const db = context.get(Database)
      const now = Date.now()
      const id = randomUUID()
      await db.create(stickers, {
        id,
        name,
        image_url: storedImageUrl,
        owner_id: user.id,
        created_at: now,
        updated_at: now,
      })
      const created = await db.findOne(stickers, { where: { id } })
      return jsonOk({ sticker: serializeSticker(created!, user as never) }, { status: 201 })
    },

    // -------- PATCH /api/stickers/:id --------
    async stickerUpdate(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const db = context.get(Database)
      const sticker = await db.findOne(stickers, { where: { id: context.params.id } })
      if (!sticker) return jsonError(404, 'Not Found')
      if (sticker.owner_id !== user.id && user.role !== 'ADMIN') {
        return jsonError(403, 'Forbidden')
      }

      // Accept either JSON ({"name": "..."}) or form-encoded body.
      let rawName: unknown
      const contentType = context.request.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        try {
          const payload = (await context.request.json()) as { name?: unknown }
          rawName = payload.name
        } catch {
          return jsonError(400, 'Invalid JSON body')
        }
      } else {
        rawName = context.get(FormData).get('name')
      }

      const nameResult = s.parseSafe(stickerNameSchema, rawName)
      if (!nameResult.success) {
        return jsonError(400, 'Validation failed', { issues: nameResult.issues })
      }
      const name = nameResult.value

      await db.update(stickers, sticker.id, { name, updated_at: Date.now() })
      const updated = await db.findOne(stickers, { where: { id: sticker.id } })
      let owner = null
      if (updated?.owner_id) {
        owner = (await db.findOne(users, { where: { id: updated.owner_id } })) ?? null
      }
      return jsonOk({ sticker: serializeSticker(updated!, owner) })
    },

    // -------- DELETE /api/stickers/:id --------
    async stickerDestroy(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const db = context.get(Database)
      const sticker = await db.findOne(stickers, { where: { id: context.params.id } })
      if (!sticker) return jsonError(404, 'Not Found')
      if (sticker.owner_id !== user.id && user.role !== 'ADMIN') {
        return jsonError(403, 'Forbidden')
      }
      await db.delete(stickers, sticker.id)
      await safeRemoveStoredUpload(sticker.image_url)
      return new Response(null, { status: 204 })
    },

    // -------- GET /api/users/:username --------
    async userShow(context) {
      const db = context.get(Database)
      const u = await db.findOne(users, { where: { username: context.params.username } })
      if (!u) return jsonError(404, 'Not Found')
      return jsonOk({
        user: {
          username: u.username,
          avatar_url: u.avatar_url ?? null,
          created_at: u.created_at,
        },
      })
    },

    // -------- GET /api/users/:username/stickers --------
    async userStickers(context) {
      const db = context.get(Database)
      const u = await db.findOne(users, { where: { username: context.params.username } })
      if (!u) return jsonError(404, 'Not Found')
      const rows = await db.findMany(stickers, {
        where: { owner_id: u.id },
        orderBy: ['created_at', 'desc'],
      })
      return jsonOk({
        user: serializeUserStub(u),
        stickers: rows.map((s) => serializeSticker(s, u)),
      })
    },

    // -------- GET /api/surfaces --------
    async surfacesIndex(context) {
      const db = context.get(Database)
      const page = readPage(context.url)
      const rows = await db.findMany(surfaces, {
        orderBy: ['created_at', 'desc'],
        limit: PAGE_SIZE + 1,
        offset: page * PAGE_SIZE,
      })
      const hasMore = rows.length > PAGE_SIZE
      const slice = rows.slice(0, PAGE_SIZE)
      const ownerIds = Array.from(new Set(slice.map((s) => s.owner_id)))
      const ownerRows = ownerIds.length
        ? await db.findMany(users, { where: inList('id', ownerIds) })
        : []
      const ownerById = new Map(ownerRows.map((u) => [u.id, u]))

      const surfaceIds = slice.map((s) => s.id)
      const allImages = surfaceIds.length
        ? await db.findMany(surfaceImages, { where: inList('surface_id', surfaceIds) })
        : []
      const imagesBySurfaceId = new Map<string, SurfaceImage[]>()
      for (const img of allImages) {
        const arr = imagesBySurfaceId.get(img.surface_id) ?? []
        arr.push(img)
        imagesBySurfaceId.set(img.surface_id, arr)
      }

      return jsonOk({
        surfaces: slice.flatMap((surface) => {
          // owner_id is NOT NULL on surfaces. If the hydrated owner is
          // somehow missing (deleted concurrently), drop the row rather
          // than emit a malformed entry.
          const owner = ownerById.get(surface.owner_id)
          if (!owner) return []
          const images = imagesBySurfaceId.get(surface.id) ?? []
          return [serializeSurface(surface, images, owner)]
        }),
        page,
        has_more: hasMore,
      })
    },

    // -------- GET /api/surfaces/:id --------
    async surfaceShow(context) {
      const db = context.get(Database)
      const surface = await db.findOne(surfaces, { where: { id: context.params.id } })
      if (!surface) return jsonError(404, 'Not Found')
      const owner = await db.findOne(users, { where: { id: surface.owner_id } })
      if (!owner) return jsonError(404, 'Not Found')
      const images = await db.findMany(surfaceImages, {
        where: { surface_id: surface.id },
      })
      return jsonOk({ surface: serializeSurface(surface, images, owner) })
    },

    // -------- POST /api/surfaces --------
    async surfaceCreate(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const uploadParsed = await readUploadFormData(context.request, {
        maxFiles: MAX_GALLERY_FILES,
        maxTotalSize: MAX_TOTAL_BYTES,
      })
      if (!uploadParsed.success) {
        return jsonError(uploadParsed.error.status, uploadParsed.error.code, {
          message: uploadParsed.error.message,
          ...uploadParsed.error.extras,
        })
      }

      const parsed = s.parseSafe(apiSurfaceCreateSchema, uploadParsed.value)
      if (!parsed.success) {
        return jsonError(400, 'Validation failed', { issues: parsed.issues })
      }
      const { name, description } = parsed.value

      const allImageFields = uploadParsed.value.getAll('image')
      const files = allImageFields.filter(
        (v): v is File => v instanceof File && v.size > 0,
      )
      if (files.length === 0) {
        return jsonError(400, 'no_image', {
          message: 'please attach at least one image',
        })
      }
      if (files.length > MAX_GALLERY_FILES) {
        return jsonError(400, 'too_many_images', {
          message: `at most ${MAX_GALLERY_FILES} images per surface`,
          max: MAX_GALLERY_FILES,
        })
      }

      // Process each file. On any failure, clean up already-stored URLs.
      const storedUrls: string[] = []
      for (const file of files) {
        try {
          const url = await processSurfaceUpload(file)
          storedUrls.push(url)
        } catch (error) {
          for (const url of storedUrls) await safeRemoveStoredUpload(url)
          if (error instanceof ProcessImageError) {
            const status = error.code === 'file_too_large' ? 413 : 400
            return jsonError(status, error.code, { message: error.message })
          }
          return jsonError(400, 'upload_failed', {
            message: error instanceof Error ? error.message : 'Upload failed',
          })
        }
      }

      const db = context.get(Database)
      const now = Date.now()
      const id = randomUUID()
      const slug = generateContentSlug(name)

      try {
        await db.transaction(async (tx) => {
          await tx.create(surfaces, {
            id,
            name,
            slug,
            ...(description == null ? {} : { description }),
            owner_id: user.id,
            created_at: now,
            updated_at: now,
          })
          for (let i = 0; i < storedUrls.length; i++) {
            await tx.create(surfaceImages, {
              id: randomUUID(),
              surface_id: id,
              image_url: storedUrls[i]!,
              is_primary: i === 0,
              created_at: now + i,
            })
          }
        })
      } catch (error) {
        for (const url of storedUrls) await safeRemoveStoredUpload(url)
        throw error
      }

      const created = await db.findOne(surfaces, { where: { id } })
      const images = await db.findMany(surfaceImages, { where: { surface_id: id } })
      return jsonOk(
        { surface: serializeSurface(created!, images, user as never) },
        { status: 201 },
      )
    },

    // -------- PATCH /api/surfaces/:id --------
    async surfaceUpdate(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, { where: { id: context.params.id } })
      if (!surface) return jsonError(404, 'Not Found')
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return jsonError(403, 'Forbidden')
      }

      // Accept either JSON ({"name":"...","description":"..."}) or a
      // form-encoded body. `hasDescription` distinguishes "field absent"
      // from "field present and empty" — the former leaves description
      // alone, the latter clears it.
      let rawName: unknown
      let rawDescription: unknown
      let hasDescription = false
      const contentType = context.request.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        try {
          const payload = (await context.request.json()) as {
            name?: unknown
            description?: unknown
          }
          rawName = payload.name
          if ('description' in payload) {
            hasDescription = true
            rawDescription = payload.description
          }
        } catch {
          return jsonError(400, 'Invalid JSON body')
        }
      } else {
        const form = context.get(FormData)
        rawName = form.get('name')
        if (form.has('description')) {
          hasDescription = true
          rawDescription = form.get('description')
        }
      }

      const nameResult = s.parseSafe(surfaceNameSchema, rawName)
      if (!nameResult.success) {
        return jsonError(400, 'Validation failed', { issues: nameResult.issues })
      }
      const name = nameResult.value

      const changes: Partial<{
        name: string
        description: string | undefined
        updated_at: number
      }> = {
        name,
        updated_at: Date.now(),
      }

      if (hasDescription) {
        const descResult = s.parseSafe(surfaceDescriptionSchema, rawDescription ?? '')
        if (!descResult.success) {
          return jsonError(400, 'Validation failed', { issues: descResult.issues })
        }
        // surfaceDescriptionSchema turns whitespace-only input into null.
        // Match the edit-surface controller pattern: cast null to undefined
        // to satisfy the column type while still writing NULL to SQLite.
        if (descResult.value === null) {
          changes.description = null as unknown as undefined
        } else {
          changes.description = descResult.value
        }
      }

      await db.update(surfaces, surface.id, changes)
      const updated = await db.findOne(surfaces, { where: { id: surface.id } })
      const owner = await db.findOne(users, { where: { id: updated!.owner_id } })
      if (!owner) return jsonError(404, 'Not Found')
      const images = await db.findMany(surfaceImages, {
        where: { surface_id: surface.id },
      })
      return jsonOk({ surface: serializeSurface(updated!, images, owner) })
    },

    // -------- DELETE /api/surfaces/:id --------
    async surfaceDestroy(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, { where: { id: context.params.id } })
      if (!surface) return jsonError(404, 'Not Found')
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return jsonError(403, 'Forbidden')
      }
      const images = await db.findMany(surfaceImages, {
        where: { surface_id: surface.id },
      })
      await db.delete(surfaces, surface.id)
      for (const img of images) {
        await safeRemoveStoredUpload(img.image_url)
      }
      return new Response(null, { status: 204 })
    },

    // -------- GET /api/users/:username/surfaces --------
    async userSurfaces(context) {
      const db = context.get(Database)
      const u = await db.findOne(users, { where: { username: context.params.username } })
      if (!u) return jsonError(404, 'Not Found')
      const rows = await db.findMany(surfaces, {
        where: { owner_id: u.id },
        orderBy: ['created_at', 'desc'],
      })

      const surfaceIds = rows.map((s) => s.id)
      const allImages = surfaceIds.length
        ? await db.findMany(surfaceImages, { where: inList('surface_id', surfaceIds) })
        : []
      const imagesBySurfaceId = new Map<string, SurfaceImage[]>()
      for (const img of allImages) {
        const arr = imagesBySurfaceId.get(img.surface_id) ?? []
        arr.push(img)
        imagesBySurfaceId.set(img.surface_id, arr)
      }

      return jsonOk({
        user: serializeUserStub(u),
        surfaces: rows.map((surface) =>
          serializeSurface(surface, imagesBySurfaceId.get(surface.id) ?? [], u),
        ),
      })
    },

    // -------- POST /api/surfaces/:id/images --------
    async surfaceImageCreate(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, { where: { id: context.params.id } })
      if (!surface) return jsonError(404, 'Not Found')
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return jsonError(403, 'Forbidden')
      }

      const currentCount = await db.count(surfaceImages, {
        where: { surface_id: surface.id },
      })
      if (currentCount >= MAX_GALLERY_FILES) {
        return jsonError(400, 'too_many_images', { max: MAX_GALLERY_FILES })
      }

      const parsed = await readUploadFormData(context.request, {
        maxFiles: 1,
        maxTotalSize: 10 * 1024 * 1024 + 1024,
      })
      if (!parsed.success) {
        return jsonError(parsed.error.status, parsed.error.code, {
          message: parsed.error.message,
          ...parsed.error.extras,
        })
      }

      const file = parsed.value.get('image')
      if (!(file instanceof File) || file.size === 0) {
        return jsonError(400, 'no_image')
      }

      let storedUrl: string
      try {
        storedUrl = await processSurfaceUpload(file)
      } catch (error) {
        if (error instanceof ProcessImageError) {
          const status = error.code === 'file_too_large' ? 413 : 400
          return jsonError(status, error.code, { message: error.message })
        }
        return jsonError(400, 'upload_failed', {
          message: error instanceof Error ? error.message : 'Upload failed',
        })
      }

      const imageId = randomUUID()
      await db.create(surfaceImages, {
        id: imageId,
        surface_id: surface.id,
        image_url: storedUrl,
        is_primary: false,
        created_at: Date.now(),
      })

      const created = await db.findOne(surfaceImages, { where: { id: imageId } })
      return new Response(JSON.stringify(serializeSurfaceImage(created!)), {
        status: 201,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    },

    // -------- DELETE /api/surfaces/:id/images/:imageId --------
    async surfaceImageDestroy(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, { where: { id: context.params.id } })
      if (!surface) return jsonError(404, 'Not Found')
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return jsonError(403, 'Forbidden')
      }

      const image = await db.findOne(surfaceImages, {
        where: { id: context.params.imageId },
      })
      if (!image) return jsonError(404, 'Not Found')
      if (image.surface_id !== surface.id) return jsonError(400, 'Bad Request')

      const count = await db.count(surfaceImages, {
        where: { surface_id: surface.id },
      })
      if (count <= 1) return jsonError(400, 'last_image')

      const wasPrimary = Boolean(image.is_primary)
      await db.delete(surfaceImages, image.id)
      await safeRemoveStoredUpload(image.image_url)

      if (wasPrimary) {
        const remaining = await db.findMany(surfaceImages, {
          where: { surface_id: surface.id },
          orderBy: ['created_at', 'asc'],
          limit: 1,
        })
        if (remaining[0]) {
          await db.update(surfaceImages, remaining[0].id, { is_primary: true })
        }
      }

      return new Response(null, { status: 204 })
    },

    // -------- POST /api/surfaces/:id/images/:imageId/primary --------
    async surfaceImageSetPrimary(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, { where: { id: context.params.id } })
      if (!surface) return jsonError(404, 'Not Found')
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return jsonError(403, 'Forbidden')
      }

      const image = await db.findOne(surfaceImages, {
        where: { id: context.params.imageId },
      })
      if (!image) return jsonError(404, 'Not Found')
      if (image.surface_id !== surface.id) return jsonError(400, 'Bad Request')

      await db.transaction(async (tx) => {
        const primaries = await tx.findMany(surfaceImages, {
          where: { surface_id: surface.id, is_primary: true },
        })
        for (const p of primaries) {
          if (p.id !== image.id) {
            await tx.update(surfaceImages, p.id, { is_primary: false })
          }
        }
        await tx.update(surfaceImages, image.id, { is_primary: true })
      })

      const owner = await db.findOne(users, { where: { id: surface.owner_id } })
      if (!owner) return jsonError(404, 'Not Found')
      const allImages = await db.findMany(surfaceImages, {
        where: { surface_id: surface.id },
      })
      return jsonOk({ surface: serializeSurface(surface, allImages, owner) })
    },

    // -------- Catch-all: any other /api/* URL --------
    notFound() {
      return jsonError(404, 'Not Found')
    },
  },
})
