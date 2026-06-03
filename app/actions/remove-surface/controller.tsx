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

export default createController(routes.removeSurface, {
  actions: {
    index(context) {
      // GET: no confirmation modal in v3; just redirect back to the profile.
      return redirect(routes.profile.href({ username: context.params.username }), 303)
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, { where: { id: context.params.surfaceId } })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const images = await db.findMany(surfaceImages, {
        where: { surface_id: surface.id },
      })
      await db.delete(surfaces, surface.id)
      for (const img of images) {
        await safeRemoveStoredUpload(img.image_url)
      }
      return redirect(routes.profile.href({ username: context.params.username }), 303)
    },
  },
})
