import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { hashPassword, verifyPassword } from '../../data/auth.ts'
import { getCurrentUser } from '../../data/current-user.ts'
import { users } from '../../data/schema.ts'
import {
  issuesToFieldErrors,
  newPasswordSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { EditProfilePage } from '../edit-profile-page.tsx'

const changePasswordSchema = f.object({
  currentPassword: f.field(s.string()),
  newPassword: f.field(newPasswordSchema),
  confirmPassword: f.field(s.string()),
})

export default createController(routes.changePassword, {
  actions: {
    // The dedicated change-password page is gone; the form lives on /account/profile.
    // Hitting this URL directly just redirects there.
    index() {
      return redirect(routes.editProfile.index.href(), 303)
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const formData = context.get(FormData)
      const parsed = s.parseSafe(changePasswordSchema, formData)
      const errors: Record<string, string> = parsed.success
        ? {}
        : issuesToFieldErrors(parsed.issues)

      // Pull the raw fields even on parse failure for cross-field checks
      // and for the password-verification step below.
      const currentPassword = parsed.success
        ? parsed.value.currentPassword
        : String(formData.get('currentPassword') ?? '')
      const newPassword = parsed.success
        ? parsed.value.newPassword
        : String(formData.get('newPassword') ?? '')
      const confirmPassword = parsed.success
        ? parsed.value.confirmPassword
        : String(formData.get('confirmPassword') ?? '')

      if (!errors.confirmPassword && newPassword !== confirmPassword) {
        errors.confirmPassword = "Passwords don't match"
      }
      if (!errors.newPassword && currentPassword === newPassword) {
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
        return context.render(<EditProfilePage user={user} passwordErrors={errors} />, {
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

      return redirect(routes.editProfile.index.href(), 303)
    },
  },
})
