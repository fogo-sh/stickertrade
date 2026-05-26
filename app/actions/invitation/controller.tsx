import { randomUUID } from 'node:crypto'

import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { hashPassword } from '../../data/auth.ts'
import { getCurrentUser } from '../../data/current-user.ts'
import { invitations, users, UserRoles } from '../../data/schema.ts'
import { routes } from '../../routes.ts'
import { formatRelative } from '../../utils/time.ts'
import { InvitationPage } from '../invitation-page.tsx'

function notFound() {
  return new Response('Not Found', { status: 404 })
}

export default createController(routes.invitation, {
  actions: {
    async index(context) {
      if (getCurrentUser(context)) return redirect(routes.home.href(), 303)

      const db = context.get(Database)
      const invitation = await db.findOne(invitations, { where: { id: context.params.id } })
      if (!invitation) return notFound()
      if (!invitation.from_id) {
        return new Response('sender of invitation deleted', { status: 403 })
      }
      const accepter = await db.findOne(users, { where: { invitation_id: invitation.id } })
      if (accepter) {
        return new Response('invitation already accepted', { status: 409 })
      }
      const from = await db.findOne(users, { where: { id: invitation.from_id } })
      if (!from) return new Response('sender of invitation deleted', { status: 403 })

      return context.render(
        <InvitationPage
          invitationId={invitation.id}
          from={{ username: from.username, avatar_url: from.avatar_url ?? null }}
          createdRelative={formatRelative(invitation.created_at)}
        />,
      )
    },

    async action(context) {
      const formData = context.get(FormData)
      const username = String(formData.get('username') ?? '').trim()
      const password = String(formData.get('password') ?? '')
      const confirmPassword = String(formData.get('confirmPassword') ?? '')

      const errors: Record<string, string> = {}
      if (username.length < 3 || username.length > 16)
        errors.username = 'Username must be 3-16 characters'
      if (password.length < 6 || password.length > 64)
        errors.password = 'Password must be 6-64 characters'
      if (password !== confirmPassword) errors.confirmPassword = "Passwords don't match"

      const db = context.get(Database)
      const invitation = await db.findOne(invitations, { where: { id: context.params.id } })
      if (!invitation) return notFound()
      if (!invitation.from_id) {
        return new Response('sender of invitation deleted', { status: 403 })
      }
      const existing = await db.findOne(users, { where: { invitation_id: invitation.id } })
      if (existing) {
        return new Response('invitation already accepted', { status: 409 })
      }

      if (Object.keys(errors).length === 0) {
        const conflict = await db.findOne(users, { where: { username } })
        if (conflict) errors.username = 'Username taken'
      }

      if (Object.keys(errors).length > 0) {
        const from = await db.findOne(users, { where: { id: invitation.from_id } })
        if (!from) return new Response('sender of invitation deleted', { status: 403 })
        return context.render(
          <InvitationPage
            invitationId={invitation.id}
            from={{ username: from.username, avatar_url: from.avatar_url ?? null }}
            createdRelative={formatRelative(invitation.created_at)}
            errors={errors}
            values={{ username }}
          />,
          { status: 400 },
        )
      }

      const now = Date.now()
      const userId = randomUUID()
      await db.create(users, {
        id: userId,
        username,
        role: UserRoles.User,
        password_hash: await hashPassword(password),
        invitation_id: invitation.id,
        invitation_limit: 10,
        created_at: now,
        updated_at: now,
      })

      const session = context.get(Session)
      session.regenerateId(true)
      session.set('auth', { userId })
      return redirect(routes.profile.href({ username }), 303)
    },
  },
})
