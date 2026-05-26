import { css } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import { SubmitButton, TextField, errorStyle, flashStyle } from '../ui/form.tsx'
import type { HeaderUser } from '../ui/header.tsx'

export interface ChangePasswordPageProps {
  user: HeaderUser
  errors?: Record<string, string>
  flash?: string
}

export function ChangePasswordPage() {
  return ({ user, errors = {}, flash }: ChangePasswordPageProps) => (
    <Document title="stickertrade - change password" user={user}>
      <main mix={css({ maxWidth: '24rem', margin: '0 auto' })}>
        <h1 mix={css({ fontSize: '1.5rem', marginBottom: '1rem' })}>change password</h1>
        {flash ? <p mix={flashStyle}>{flash}</p> : null}
        <form method="post" action={routes.changePassword.action.href()}>
          <TextField
            name="currentPassword"
            label="current password"
            type="password"
            error={errors.currentPassword}
          />
          <TextField
            name="newPassword"
            label="new password"
            type="password"
            error={errors.newPassword}
          />
          <TextField
            name="confirmPassword"
            label="confirm new password"
            type="password"
            error={errors.confirmPassword}
          />
          {errors._form ? <p mix={errorStyle}>{errors._form}</p> : null}
          <SubmitButton label="change password" />
        </form>
      </main>
    </Document>
  )
}
