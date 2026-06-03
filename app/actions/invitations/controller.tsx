import { randomUUID } from 'node:crypto'

import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { absoluteUrl } from '../../data/public-origin.ts'
import { config, invitations, users } from '../../data/schema.ts'
import { routes } from '../../routes.ts'
import { formatRelative } from '../../utils/time.ts'
import { InvitationsPage, type InvitationRow } from './invitations-page.tsx'

export default createController(routes.invitations, {
  actions: {
    async index(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const userRow = await db.findOne(users, { where: { id: user.id } })
      if (!userRow) return redirect(routes.login.index.href(), 303)

      const cfg = await db.findOne(config, { where: { id: 1 } })
      const invitationsEnabled = cfg ? Boolean(cfg.invitations_enabled) : true

      const rows = await db.findMany(invitations, {
        where: { from_id: user.id },
        orderBy: ['created_at', 'desc'],
      })

      const invs: InvitationRow[] = []
      for (const row of rows) {
        const accepter = await db.findOne(users, { where: { invitation_id: row.id } })
        invs.push({
          id: row.id,
          url: absoluteUrl(routes.invitation.index.href({ id: row.id })),
          to: accepter
            ? {
                username: accepter.username,
                avatar_url: accepter.avatar_url ?? null,
                createdRelative: formatRelative(accepter.created_at),
              }
            : null,
        })
      }

      const remaining = Math.max(0, userRow.invitation_limit - invs.length)

      return context.render(
        <InvitationsPage
          user={user}
          invitations={invs}
          remaining={remaining}
          invitationsEnabled={invitationsEnabled}
        />,
      )
    },

    async generate(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const userRow = await db.findOne(users, { where: { id: user.id } })
      if (!userRow) return redirect(routes.login.index.href(), 303)

      const cfg = await db.findOne(config, { where: { id: 1 } })
      const invitationsEnabled = cfg ? Boolean(cfg.invitations_enabled) : true
      if (!invitationsEnabled && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const used = await db.count(invitations, { where: { from_id: user.id } })
      if (used >= userRow.invitation_limit && user.role !== 'ADMIN') {
        return new Response('invitation limit reached', { status: 403 })
      }

      const now = Date.now()
      await db.create(invitations, {
        id: randomUUID(),
        from_id: user.id,
        created_at: now,
        updated_at: now,
      })

      return redirect(routes.invitations.index.href(), 303)
    },

    async destroy(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const inv = await db.findOne(invitations, { where: { id: context.params.id } })
      if (!inv) return new Response('Not Found', { status: 404 })
      if (inv.from_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const accepter = await db.findOne(users, { where: { invitation_id: inv.id } })
      if (accepter) {
        return new Response('invitation already accepted', { status: 409 })
      }

      await db.delete(invitations, inv.id)
      return redirect(routes.invitations.index.href(), 303)
    },
  },
})
