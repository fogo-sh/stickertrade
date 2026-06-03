import { Database } from 'remix/data-table'
import { inList } from 'remix/data-table/operators'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { stickers, users } from '../../data/schema.ts'
import { routes } from '../../routes.ts'
import { formatRelative } from '../../utils/time.ts'
import { AdminStickersPage } from './admin-stickers-page.tsx'
import { AdminUsersPage } from './admin-users-page.tsx'

const PAGE_SIZE = 30

function ensureAdmin(
  context: Parameters<typeof getCurrentUser>[0],
): { user: ReturnType<typeof getCurrentUser>; response: Response | null } {
  const user = getCurrentUser(context)
  if (!user) return { user: null, response: redirect(routes.login.index.href(), 303) }
  if (user.role !== 'ADMIN')
    return { user: null, response: new Response('Forbidden', { status: 403 }) }
  return { user, response: null }
}

function readPage(url: URL): number {
  const raw = url.searchParams.get('page') ?? '0'
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export default createController(routes.admin, {
  actions: {
    async users(context) {
      const check = ensureAdmin(context)
      if (check.response) return check.response
      const user = check.user!

      const db = context.get(Database)
      const page = readPage(context.url)
      const rows = await db.findMany(users, {
        orderBy: ['updated_at', 'desc'],
        limit: PAGE_SIZE + 1,
        offset: page * PAGE_SIZE,
      })
      const hasNext = rows.length > PAGE_SIZE
      const slice = rows.slice(0, PAGE_SIZE)

      return context.render(
        <AdminUsersPage
          user={user}
          page={page}
          hasNext={hasNext}
          users={slice.map((u) => ({
            id: u.id,
            username: u.username,
            avatar_url: u.avatar_url ?? null,
            role: u.role,
            createdRelative: formatRelative(u.created_at),
            updatedRelative: formatRelative(u.updated_at),
          }))}
        />,
      )
    },

    async deleteUser(context) {
      const check = ensureAdmin(context)
      if (check.response) return check.response

      const db = context.get(Database)
      await db.delete(users, context.params.id)
      return redirect(routes.admin.users.href(), 303)
    },

    async stickers(context) {
      const check = ensureAdmin(context)
      if (check.response) return check.response
      const user = check.user!

      const db = context.get(Database)
      const page = readPage(context.url)
      const rows = await db.findMany(stickers, {
        orderBy: ['updated_at', 'desc'],
        limit: PAGE_SIZE + 1,
        offset: page * PAGE_SIZE,
      })
      const hasNext = rows.length > PAGE_SIZE
      const slice = rows.slice(0, PAGE_SIZE)

      const ownerIds = Array.from(new Set(slice.map((s) => s.owner_id).filter((id): id is string => !!id)))
      const ownerRows = ownerIds.length
        ? await db.findMany(users, { where: inList('id', ownerIds) })
        : []
      const ownerById = new Map(ownerRows.map((o) => [o.id, o]))

      return context.render(
        <AdminStickersPage
          user={user}
          page={page}
          hasNext={hasNext}
          stickers={slice.map((s) => {
            const owner = s.owner_id ? ownerById.get(s.owner_id) ?? null : null
            return {
              id: s.id,
              slug: s.slug,
              name: s.name,
              image_url: s.image_url,
              owner: owner ? { username: owner.username, avatar_url: owner.avatar_url ?? null } : null,
              createdRelative: formatRelative(s.created_at),
            }
          })}
        />,
      )
    },

    async deleteSticker(context) {
      const check = ensureAdmin(context)
      if (check.response) return check.response

      const db = context.get(Database)
      await db.delete(stickers, context.params.id)
      return redirect(routes.admin.stickers.href(), 303)
    },
  },
})
