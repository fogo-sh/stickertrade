import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces, surfaceImages } from '../../data/schema.ts'
import { routes } from '../../routes.ts'

function notFound() {
  return new Response('Not Found', { status: 404 })
}

export default createController(routes.setPrimarySurfaceImage, {
  actions: {
    index(context) {
      // GET: not a real page; bounce back to the edit form.
      return redirect(
        `/surface/${encodeURIComponent(context.params.slug)}/edit`,
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

      // Transactional demote + promote. The partial unique index requires
      // that we demote the existing primary BEFORE promoting the new one,
      // otherwise the UNIQUE constraint fires.
      await db.transaction(async (tx) => {
        const currentPrimaries = await tx.findMany(surfaceImages, {
          where: { surface_id: surface.id, is_primary: true },
        })
        for (const p of currentPrimaries) {
          if (p.id !== image.id) {
            await tx.update(surfaceImages, p.id, { is_primary: false })
          }
        }
        await tx.update(surfaceImages, image.id, { is_primary: true })
      })

      return redirect(
        `/surface/${encodeURIComponent(surface.slug)}/edit`,
        303,
      )
    },
  },
})
