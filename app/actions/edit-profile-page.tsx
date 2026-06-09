import { css, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import {
  CsrfField,
  FileField,
  SubmitButton,
  TextField,
  errorStyle,
  flashStyle,
} from '../ui/form.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { colors } from '../ui/theme.ts'

export interface TokenRow {
  id: string
  name: string
  prefix: string
  created_at: number
  last_used_at: number | null
}

export interface EditProfilePageProps {
  user: HeaderUser
  /** Errors and flash for the avatar form. */
  avatarErrors?: Record<string, string>
  avatarFlash?: string
  /** Errors and flash for the password form. */
  passwordErrors?: Record<string, string>
  passwordFlash?: string
  /** API tokens for the current user. */
  tokens?: TokenRow[]
  tokenErrors?: Record<string, string>
  tokenFlash?: string
  /** Plaintext value of a freshly-created token, shown exactly once. */
  newToken?: { name: string; plaintext: string }
}

export function EditProfilePage(handle: Handle<EditProfilePageProps>) {
  return () => {
    const {
      user,
      avatarErrors = {},
      avatarFlash,
      passwordErrors = {},
      passwordFlash,
      tokens = [],
      tokenErrors = {},
      tokenFlash,
      newToken,
    } = handle.props
    return (
    <Document title="stickertrade - edit profile" user={user}>
      <main mix={css({ maxWidth: '28rem', margin: '0 auto' })}>
        <h1 mix={css({ fontSize: '1.5rem', marginBottom: '1rem' })}>edit profile</h1>

        <section mix={sectionStyle}>
          <h2 mix={sectionHeadingStyle}>avatar</h2>
          {avatarFlash ? <p mix={flashStyle}>{avatarFlash}</p> : null}

          <div mix={css({ marginBottom: '1rem' })}>
            <p mix={css({ fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.7 })}>
              current avatar
            </p>
            <img
              src={user.avatar_url ?? '/images/default-avatar.webp'}
              alt={user.username}
              mix={avatarPreviewStyle}
            />
          </div>

          <form
            method="post"
            action={routes.editProfile.action.href()}
            encType="multipart/form-data"
          >
            <CsrfField />
            <FileField name="avatar" label="upload new avatar" error={avatarErrors.avatar} />
            <p mix={helpTextStyle}>
              png or jpeg, max 10 MB. cropped to a square and resized to 512×512.
            </p>
            {avatarErrors._form ? <p mix={errorStyle}>{avatarErrors._form}</p> : null}
            <SubmitButton label="save avatar" />
          </form>

          {user.avatar_url ? (
            <form
              method="post"
              action={routes.editProfile.action.href()}
              mix={css({ marginTop: '0.75rem' })}
            >
              <CsrfField />
              <input type="hidden" name="action" value="remove-avatar" />
              <button type="submit" mix={removeBtnStyle}>
                remove current avatar
              </button>
            </form>
          ) : null}
        </section>

        <section mix={sectionStyle}>
          <h2 mix={sectionHeadingStyle}>change password</h2>
          {passwordFlash ? <p mix={flashStyle}>{passwordFlash}</p> : null}

          <form method="post" action={routes.changePassword.action.href()}>
            <CsrfField />
            <TextField
              name="currentPassword"
              label="current password"
              type="password"
              error={passwordErrors.currentPassword}
            />
            <TextField
              name="newPassword"
              label="new password"
              type="password"
              error={passwordErrors.newPassword}
            />
            <TextField
              name="confirmPassword"
              label="confirm new password"
              type="password"
              error={passwordErrors.confirmPassword}
            />
            {passwordErrors._form ? <p mix={errorStyle}>{passwordErrors._form}</p> : null}
            <SubmitButton label="change password" />
          </form>
        </section>

        <section mix={sectionStyle}>
          <h2 mix={sectionHeadingStyle}>api tokens</h2>
          {tokenFlash ? <p mix={flashStyle}>{tokenFlash}</p> : null}
          {newToken ? (
            <div mix={newTokenBoxStyle}>
              <p mix={css({ marginBottom: '0.5rem', fontWeight: 600 })}>
                token "{newToken.name}" created
              </p>
              <p mix={css({ marginBottom: '0.5rem', fontSize: '0.85rem' })}>
                copy this value now — you won't be able to see it again.
              </p>
              <code mix={newTokenValueStyle}>{newToken.plaintext}</code>
            </div>
          ) : null}

          <p mix={helpTextStyle}>
            tokens authenticate API requests via{' '}
            <code>Authorization: Bearer &lt;token&gt;</code>. each token has the same
            permissions as your account.
          </p>

          {tokens.length === 0 ? (
            <p mix={css({ fontStyle: 'italic', opacity: 0.7, marginBottom: '0.75rem' })}>
              no tokens yet.
            </p>
          ) : (
            <ul mix={tokenListStyle}>
              {tokens.map((tok) => (
                <li key={tok.id} mix={tokenRowStyle}>
                  <div>
                    <p mix={css({ fontWeight: 600 })}>{tok.name}</p>
                    <p mix={css({ fontSize: '0.8rem', opacity: 0.7 })}>
                      <code>{tok.prefix}…</code> · created{' '}
                      {new Date(tok.created_at).toISOString().slice(0, 10)}
                      {tok.last_used_at
                        ? ` · last used ${new Date(tok.last_used_at).toISOString().slice(0, 10)}`
                        : ' · never used'}
                    </p>
                  </div>
                  <form method="post" action={routes.revokeApiToken.href({ id: tok.id })}>
                    <CsrfField />
                    <button type="submit" mix={removeBtnStyle}>
                      revoke
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form method="post" action={routes.createApiToken.href()}>
            <CsrfField />
            <TextField name="name" label="token name (e.g. 'my laptop')" error={tokenErrors.name} />
            {tokenErrors._form ? <p mix={errorStyle}>{tokenErrors._form}</p> : null}
            <SubmitButton label="create token" />
          </form>
        </section>
      </main>
    </Document>
    )
  }
}

const sectionStyle = css({
  marginBottom: '2rem',
  paddingBottom: '1.5rem',
  borderBottom: `1px solid ${colors.light[500]}33`,
  '&:last-child': { borderBottom: 'none' },
})

const sectionHeadingStyle = css({
  fontSize: '1.125rem',
  fontWeight: 600,
  marginBottom: '0.75rem',
})

const helpTextStyle = css({
  fontSize: '0.85rem',
  opacity: 0.7,
  marginBottom: '0.75rem',
})

const avatarPreviewStyle = css({
  width: '8rem',
  height: '8rem',
  borderRadius: '999px',
  objectFit: 'cover',
  border: `2px solid ${colors.light[500]}40`,
})

const removeBtnStyle = css({
  padding: '0.4rem 0.75rem',
  background: 'transparent',
  color: colors.primary[500],
  border: `1px solid ${colors.primary[500]}`,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '0.85rem',
  '&:hover': { background: colors.primary[500], color: colors.dark[500] },
})

const tokenListStyle = css({
  listStyle: 'none',
  margin: '0 0 1rem',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
})

const tokenRowStyle = css({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.5rem 0.75rem',
  border: `1px solid ${colors.light[500]}33`,
  gap: '0.5rem',
})

const newTokenBoxStyle = css({
  marginBottom: '1rem',
  padding: '0.75rem',
  background: colors.dark[400],
  border: `1px solid ${colors.primary[500]}`,
})

const newTokenValueStyle = css({
  display: 'block',
  padding: '0.5rem',
  background: colors.dark[500],
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.85rem',
  wordBreak: 'break-all',
  color: colors.primary[400],
})
