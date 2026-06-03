import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces } from '../../data/schema.ts'
import { uploadStorage } from '../../data/uploads.ts'
import { routes } from '../../routes.ts'

function notFound() {
  return new Response('Not Found', { status: 404 })
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

      await db.delete(surfaces, surface.id)
      if (surface.image_url.startsWith('/uploads/')) {
        const key = surface.image_url.slice('/uploads/'.length)
        try {
          await uploadStorage.remove(key)
        } catch {
          // ignore
        }
      }
      return redirect(routes.profile.href({ username: context.params.username }), 303)
    },
  },
})
