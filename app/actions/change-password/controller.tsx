import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { hashPassword, verifyPassword } from '../../data/auth.ts'
import { getCurrentUser } from '../../data/current-user.ts'
import { users } from '../../data/schema.ts'
import { routes } from '../../routes.ts'
import { ChangePasswordPage } from '../change-password-page.tsx'

export default createController(routes.changePassword, {
  actions: {
    index(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)
      const session = context.get(Session)
      const flash = session.get('password_flash') as string | undefined
      session.unset('password_flash')
      return context.render(<ChangePasswordPage user={user} flash={flash} />)
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const formData = context.get(FormData)
      const currentPassword = String(formData.get('currentPassword') ?? '')
      const newPassword = String(formData.get('newPassword') ?? '')
      const confirmPassword = String(formData.get('confirmPassword') ?? '')

      const errors: Record<string, string> = {}
      if (newPassword.length < 8 || newPassword.length > 64) {
        errors.newPassword = 'New password must be 8-64 characters'
      }
      if (newPassword !== confirmPassword) {
        errors.confirmPassword = "Passwords don't match"
      }
      if (currentPassword === newPassword && !errors.newPassword) {
        errors.newPassword = 'New password must be different from current password'
      }

      const db = context.get(Database)

      if (Object.keys(errors).length === 0) {
        const row = await db.findOne(users, { where: { id: user.id } })
        if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
          errors.currentPassword = 'Current password is incorrect'
        }
      }

      if (Object.keys(errors).length > 0) {
        return context.render(<ChangePasswordPage user={user} errors={errors} />, {
          status: 400,
        })
      }

      await db.update(users, user.id, {
        password_hash: await hashPassword(newPassword),
        updated_at: Date.now(),
      })

      // Rotate the session ID after a credential change so any stolen
      // session cookie is invalidated.
      const session = context.get(Session)
      session.regenerateId(true)
      session.flash('password_flash', 'Password updated.')

      return redirect(routes.changePassword.index.href(), 303)
    },
  },
})
