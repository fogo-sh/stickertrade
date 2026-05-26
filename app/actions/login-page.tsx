import { css } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import { SubmitButton, TextField, errorStyle, flashStyle } from '../ui/form.tsx'

export interface LoginPageProps {
  errors?: Record<string, string>
  values?: { username?: string }
  flash?: string
}

export function LoginPage() {
  return ({ errors = {}, values = {}, flash }: LoginPageProps) => (
    <Document title="stickertrade - login">
      <main mix={css({ maxWidth: '24rem', margin: '0 auto' })}>
        <h1 mix={css({ fontSize: '1.5rem', marginBottom: '1rem' })}>login</h1>
        {flash ? <p mix={flashStyle}>{flash}</p> : null}
        <form method="post" action={routes.login.action.href()}>
          <TextField name="username" label="username" value={values.username} error={errors.username} />
          <TextField name="password" label="password" type="password" error={errors.password} />
          {errors._form ? <p mix={errorStyle}>{errors._form}</p> : null}
          <SubmitButton label="login" />
        </form>
      </main>
    </Document>
  )
}
