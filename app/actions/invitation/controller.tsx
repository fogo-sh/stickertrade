import { randomUUID } from 'node:crypto'

import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { hashPassword } from '../../data/auth.ts'
import { getCurrentUser } from '../../data/current-user.ts'
import { invitations, users, UserRoles } from '../../data/schema.ts'
import {
  issuesToFieldErrors,
  newPasswordSchema,
  usernameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { formatRelative } from '../../utils/time.ts'
import { InvitationPage } from '../invitation-page.tsx'

const acceptInvitationSchema = f.object({
  username: f.field(usernameSchema),
  password: f.field(newPasswordSchema),
  confirmPassword: f.field(s.string()),
})

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
      const parsed = s.parseSafe(acceptInvitationSchema, formData)
      const errors: Record<string, string> = parsed.success
        ? {}
        : issuesToFieldErrors(parsed.issues)
      const username = parsed.success
        ? parsed.value.username
        : String(formData.get('username') ?? '').trim()
      const password = parsed.success
        ? parsed.value.password
        : String(formData.get('password') ?? '')
      const confirmPassword = parsed.success
        ? parsed.value.confirmPassword
        : String(formData.get('confirmPassword') ?? '')

      if (!errors.confirmPassword && password !== confirmPassword) {
        errors.confirmPassword = "Passwords don't match"
      }

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
