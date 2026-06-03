import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaceImages, surfaces } from '../../data/schema.ts'
import { looksLikeUuid } from '../../data/slug.ts'
import { sortGalleryImages } from '../../data/surface-images.ts'
import {
  issuesToFieldErrors,
  surfaceDescriptionSchema,
  surfaceNameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { EditSurfacePage } from '../edit-surface-page.tsx'

const editSurfaceSchema = f.object({
  name: f.field(surfaceNameSchema),
  description: f.field(s.optional(surfaceDescriptionSchema)),
})

function notFound() {
  return new Response('Not Found', { status: 404 })
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
        return redirect(routes.editSurface.index.href({ slug: byId.slug }), 301)
      }
      const surface = await db.findOne(surfaces, { where: { slug: param } })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const imageRows = await db.findMany(surfaceImages, {
        where: { surface_id: surface.id },
      })
      const images = sortGalleryImages(imageRows)

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
          }}
          images={images.map((img) => ({
            id: img.id,
            image_url: img.image_url,
            is_primary: Boolean(img.is_primary),
          }))}
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
      const surface = await db.findOne(surfaces, {
        where: { slug: context.params.slug },
      })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const formData = context.get(FormData)
      const parsed = s.parseSafe(editSurfaceSchema, formData)
      if (!parsed.success) {
        const errors = issuesToFieldErrors(parsed.issues)
        const fallbackRows = await db.findMany(surfaceImages, {
          where: { surface_id: surface.id },
        })
        const fallbackImages = sortGalleryImages(fallbackRows)
        return context.render(
          <EditSurfacePage
            user={user}
            surface={{
              id: surface.id,
              slug: surface.slug,
              name: String(formData.get('name') ?? ''),
              description: String(formData.get('description') ?? '') || null,
            }}
            images={fallbackImages.map((img) => ({
              id: img.id,
              image_url: img.image_url,
              is_primary: Boolean(img.is_primary),
            }))}
            errors={errors}
          />,
          { status: 400 },
        )
      }

      const { name, description } = parsed.value
      const changes: Partial<{
        name: string
        description: string | undefined
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

      // Slug is FROZEN on rename — do not regenerate.
      await db.update(surfaces, surface.id, changes)

      const session = context.get(Session)
      session.flash('surface_flash', 'Surface updated.')
      return redirect(routes.surface.href({ slug: surface.slug }), 303)
    },
  },
})
