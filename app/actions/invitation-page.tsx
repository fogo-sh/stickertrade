import { css } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import { SubmitButton, TextField, errorStyle } from '../ui/form.tsx'

export interface InvitationPageProps {
  invitationId: string
  from: { username: string; avatar_url: string | null }
  createdRelative: string
  errors?: Record<string, string>
  values?: { username?: string }
}

export function InvitationPage() {
  return ({
    invitationId,
    from,
    createdRelative,
    errors = {},
    values = {},
  }: InvitationPageProps) => (
    <Document title={`stickertrade - invitation from ${from.username}`}>
      <main mix={css({ maxWidth: '32rem', margin: '0 auto' })}>
        <h1 mix={titleStyle}>you have been invited to stickertrade! 🎉</h1>
        <div mix={fromRowStyle}>
          <img
            src={from.avatar_url ?? '/images/default-avatar.webp'}
            alt={from.username}
            mix={avatarStyle}
          />
          <p>
            {from.username} created an invitation {createdRelative} ago
          </p>
        </div>
        <div mix={css({ maxWidth: '24rem', margin: '0 auto' })}>
          <form method="post" action={routes.invitation.action.href({ id: invitationId })}>
            <TextField
              name="username"
              label="create username"
              value={values.username}
              error={errors.username}
            />
            <TextField name="password" label="set password" type="password" error={errors.password} />
            <TextField
              name="confirmPassword"
              label="confirm password"
              type="password"
              error={errors.confirmPassword}
            />
            {errors._form ? <p mix={errorStyle}>{errors._form}</p> : null}
            <SubmitButton label="accept invitation" />
          </form>
        </div>
      </main>
    </Document>
  )
}

const titleStyle = css({
  fontSize: '1.25rem',
  textAlign: 'center',
  marginBottom: '1rem',
})

const fromRowStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  margin: '1rem 0',
})

const avatarStyle = css({
  width: '1.5em',
  height: '1.5em',
  borderRadius: '999px',
  objectFit: 'cover',
})
