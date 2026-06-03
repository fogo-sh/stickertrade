import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces } from '../../data/schema.ts'
import { looksLikeUuid } from '../../data/slug.ts'
import { processSurfaceUpload } from '../../data/upload-image.ts'
import { uploadStorage } from '../../data/uploads.ts'
import {
  issuesToFieldErrors,
  surfaceDescriptionSchema,
  surfaceNameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { readVerifiedUploadFormData } from '../../utils/upload.ts'
import { EditSurfacePage } from '../edit-surface-page.tsx'

// On the edit page the image field is optional — submitting without a file
// keeps the existing image. We map any zero-byte File or absent field to
// `undefined` so the action can branch on its presence cleanly.
const optionalImage = s
  .optional(s.instanceof_(File))
  .transform((value) => (value && value.size > 0 ? value : undefined))

const editSurfaceSchema = f.object({
  name: f.field(surfaceNameSchema),
  description: f.field(s.optional(surfaceDescriptionSchema)),
  image: f.file(optionalImage),
})

function notFound() {
  return new Response('Not Found', { status: 404 })
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

export default createController(routes.editSurface, {
  actions: {
    async index(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const param = context.params.slug
      if (looksLikeUuid(param)) {
        const byId = await db.findOne(surfaces, { where: { id: param } })
        if (!byId) return notFound()
        return redirect(`/surface/${encodeURIComponent(byId.slug)}/edit`, 301)
      }
      const surface = await db.findOne(surfaces, { where: { slug: param } })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const session = context.get(Session)
      const flash = session.get('surface_flash') as string | undefined
      session.unset('surface_flash')

      return context.render(
        <EditSurfacePage
          user={user}
          surface={{
            id: surface.id,
            slug: surface.slug,
            name: surface.name,
            description: surface.description ?? null,
            image_url: surface.image_url,
          }}
          flash={flash}
        />,
      )
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      // POST: look up by slug only. A POST to /surface/<uuid>/edit is a
      // stale form submission -- return 404 so the user re-navigates.
      const surface = await db.findOne(surfaces, { where: { slug: context.params.slug } })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      // Two flows hit this action: a multipart submit with a new image, or
      // a url-encoded submit that only changes the name/description. The
      // global form-data middleware parses the url-encoded body for us; we
      // parse the multipart body here so upload-too-large errors render inline.
      const contentType = context.request.headers.get('content-type') ?? ''
      const isMultipart = contentType.startsWith('multipart/form-data')

      let formData: FormData
      if (isMultipart) {
        const verified = await readVerifiedUploadFormData(context)
        if (!verified.success) {
          if (verified.kind === 'csrf') return verified.response
          return context.render(
            <EditSurfacePage
              user={user}
              surface={{
                id: surface.id,
                slug: surface.slug,
                name: surface.name,
                description: surface.description ?? null,
                image_url: surface.image_url,
              }}
              errors={{ image: verified.error.message }}
            />,
            { status: verified.error.status },
          )
        }
        formData = verified.value
      } else {
        formData = context.get(FormData)
      }

      const parsed = s.parseSafe(editSurfaceSchema, formData)
      if (!parsed.success) {
        const errors = issuesToFieldErrors(parsed.issues)
        return context.render(
          <EditSurfacePage
            user={user}
            surface={{
              id: surface.id,
              slug: surface.slug,
              name: String(formData.get('name') ?? ''),
              description: String(formData.get('description') ?? '') || null,
              image_url: surface.image_url,
            }}
            errors={errors}
          />,
          { status: 400 },
        )
      }

      const { name, description, image } = parsed.value
      const changes: Partial<{
        name: string
        description: string | undefined
        image_url: string
        updated_at: number
      }> = {
        name,
        updated_at: Date.now(),
      }

      // surfaceDescriptionSchema turns whitespace-only input into null. To
      // clear the column on update, write `null as unknown as undefined`
      // (matches the avatar-removal pattern in edit-profile/controller.tsx).
      if (description === null) {
        changes.description = null as unknown as undefined
      } else if (description !== undefined) {
        changes.description = description
      }

      if (image) {
        let storedUrl: string
        try {
          storedUrl = await processSurfaceUpload(image)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed'
          return context.render(
            <EditSurfacePage
              user={user}
              surface={{
                id: surface.id,
                slug: surface.slug,
                name,
                description: description ?? null,
                image_url: surface.image_url,
              }}
              errors={{ image: message }}
            />,
            { status: 400 },
          )
        }
        changes.image_url = storedUrl
      }

      // Slug is FROZEN on rename — do not regenerate.
      await db.update(surfaces, surface.id, changes)

      // After the row is updated, clean up the previous file if it was replaced.
      if (image) {
        await safeRemoveStoredUpload(surface.image_url)
      }

      const session = context.get(Session)
      session.flash('surface_flash', 'Surface updated.')
      return redirect(`/surface/${encodeURIComponent(surface.slug)}`, 303)
    },
  },
})
