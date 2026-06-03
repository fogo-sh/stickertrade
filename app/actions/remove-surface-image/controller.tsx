import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces, surfaceImages } from '../../data/schema.ts'
import { uploadStorage } from '../../data/uploads.ts'
import { routes } from '../../routes.ts'

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

export default createController(routes.removeSurfaceImage, {
  actions: {
    index(context) {
      // GET: not a real page; bounce back to the edit form.
      return redirect(
        routes.editSurface.index.href({ slug: context.params.slug }),
        303,
      )
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, {
        where: { slug: context.params.slug },
      })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const image = await db.findOne(surfaceImages, {
        where: { id: context.params.imageId },
      })
      if (!image) return notFound()
      if (image.surface_id !== surface.id) {
        return new Response('Bad Request', { status: 400 })
      }

      // Can't remove the last image.
      const count = await db.count(surfaceImages, {
        where: { surface_id: surface.id },
      })
      if (count <= 1) {
        return new Response(
          'A surface must have at least one image',
          { status: 400 },
        )
      }

      const wasPrimary = Boolean(image.is_primary)

      await db.delete(surfaceImages, image.id)
      await safeRemoveStoredUpload(image.image_url)

      // Promote the next-oldest image if we just removed the primary.
      if (wasPrimary) {
        const remaining = await db.findMany(surfaceImages, {
          where: { surface_id: surface.id },
          orderBy: ['created_at', 'asc'],
          limit: 1,
        })
        if (remaining[0]) {
          await db.update(surfaceImages, remaining[0].id, {
            is_primary: true,
          })
        }
      }

      return redirect(
        routes.editSurface.index.href({ slug: surface.slug }),
        303,
      )
    },
  },
})
