import { randomUUID } from 'node:crypto'

import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { inList } from 'remix/data-table/operators'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { stickers, surfaces, users } from '../../data/schema.ts'
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
  image: f.file(
    s.instanceof_(File).refine((file) => file.size > 0, 'Please attach an image'),
  ),
})

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
      return jsonOk({
        surfaces: slice.flatMap((surface) => {
          // owner_id is NOT NULL on surfaces. If the hydrated owner is
          // somehow missing (deleted concurrently), drop the row rather
          // than emit a malformed entry.
          const owner = ownerById.get(surface.owner_id)
          return owner ? [serializeSurface(surface, owner)] : []
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
      return jsonOk({ surface: serializeSurface(surface, owner) })
    },

    // -------- POST /api/surfaces --------
    async surfaceCreate(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const uploadParsed = await readUploadFormData(context.request)
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
      const { name, description, image } = parsed.value

      let storedImageUrl: string
      try {
        storedImageUrl = await processSurfaceUpload(image)
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
      const slug = generateContentSlug(name)
      await db.create(surfaces, {
        id,
        name,
        slug,
        ...(description == null ? {} : { description }),
        image_url: storedImageUrl,
        owner_id: user.id,
        created_at: now,
        updated_at: now,
      })
      const created = await db.findOne(surfaces, { where: { id } })
      return jsonOk(
        { surface: serializeSurface(created!, user as never) },
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
      return jsonOk({ surface: serializeSurface(updated!, owner) })
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
      await db.delete(surfaces, surface.id)
      await safeRemoveStoredUpload(surface.image_url)
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
      return jsonOk({
        user: serializeUserStub(u),
        surfaces: rows.map((surface) => serializeSurface(surface, u)),
      })
    },

    // -------- Catch-all: any other /api/* URL --------
    notFound() {
      return jsonError(404, 'Not Found')
    },
  },
})
