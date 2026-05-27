import { css } from 'remix/ui'

import { routes } from '../../routes.ts'
import { Document } from '../../ui/document.tsx'
import { CsrfField } from '../../ui/form.tsx'
import type { HeaderUser } from '../../ui/header.tsx'
import { colors } from '../../ui/theme.ts'

export interface InvitationRow {
  id: string
  url: string
  to: { username: string; avatar_url: string | null; createdRelative: string } | null
}

export interface InvitationsPageProps {
  user: HeaderUser
  invitations: InvitationRow[]
  remaining: number
  invitationsEnabled: boolean
}

export function InvitationsPage() {
  return ({ user, invitations, remaining, invitationsEnabled }: InvitationsPageProps) => {
    const isAdmin = user.role === 'ADMIN'
    const blocked = !invitationsEnabled && !isAdmin
    return (
      <Document title="stickertrade - invitations" user={user}>
        <main mix={css({ maxWidth: '32rem', margin: '0 auto' })}>
          <h1 mix={css({ fontSize: '1.5rem', marginBottom: '1rem' })}>invitations</h1>

          {!invitationsEnabled ? (
            <>
              <p mix={disabledHeader}>invitations are currently disabled site-wide</p>
              {isAdmin ? (
                <p mix={adminNote}>but you're an admin, so you're gucci</p>
              ) : null}
            </>
          ) : null}

          <div mix={blocked ? listBlocked : listStyle}>
            {invitations.map((inv) =>
              inv.to === null ? (
                <div key={inv.id} mix={pendingRowStyle}>
                  <input value={inv.url} readOnly mix={urlInputStyle} />
                  <form
                    method="post"
                    action={routes.invitations.destroy.href({ id: inv.id })}
                    mix={css({ display: 'inline' })}
                  >
                    <CsrfField />
                    <button type="submit" mix={destroyBtnStyle} aria-label="destroy invitation">
                      ✕
                    </button>
                  </form>
                </div>
              ) : (
                <a
                  key={inv.id}
                  href={routes.profile.href({ username: inv.to.username })}
                  mix={acceptedRowStyle}
                >
                  <img
                    src={inv.to.avatar_url ?? '/images/default-avatar.webp'}
                    alt={inv.to.username}
                    mix={avatarStyle}
                  />
                  <p>
                    {inv.to.username}{' '}
                    <span mix={css({ opacity: 0.5 })}>accepted {inv.to.createdRelative} ago</span>
                  </p>
                </a>
              ),
            )}
            {remaining > 0 ? (
              <form method="post" action={routes.invitations.generate.href()} mix={generateRowStyle}>
                <CsrfField />
                <button type="submit" mix={generateBtnStyle}>
                  generate invitation
                </button>
              </form>
            ) : null}
            {Array.from({ length: Math.max(0, remaining - 1) }).map((_, i) => (
              <div key={`empty-${i}`} mix={emptyRowStyle} />
            ))}
          </div>
          <p mix={css({ fontStyle: 'italic', textAlign: 'center', marginTop: '0.5rem' })}>
            {remaining} invitations remaining
          </p>
        </main>
      </Document>
    )
  }
}

const listStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  marginTop: '1rem',
})

const listBlocked = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  marginTop: '1rem',
  opacity: 0.5,
  pointerEvents: 'none',
})

const disabledHeader = css({
  fontSize: '1.125rem',
  color: colors.primary[500],
  textAlign: 'center',
})

const adminNote = css({
  fontStyle: 'italic',
  color: colors.primary[400],
  textAlign: 'center',
})

const pendingRowStyle = css({
  width: '100%',
  minHeight: '3rem',
  borderRadius: '0.25rem',
  border: `1px solid ${colors.light[500]}66`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  padding: '0 0.5rem',
})

const urlInputStyle = css({
  flex: 1,
  background: 'transparent',
  color: colors.light[500],
  border: 'none',
  font: 'inherit',
})

const destroyBtnStyle = css({
  background: 'transparent',
  color: colors.light[500],
  border: 'none',
  cursor: 'pointer',
  fontSize: '1.25rem',
  padding: '0 0.25rem',
  '&:hover': { color: colors.primary[500] },
})

const acceptedRowStyle = css({
  width: '100%',
  minHeight: '3rem',
  borderRadius: '0.25rem',
  border: `1px solid ${colors.light[500]}66`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  padding: '0 0.5rem',
  '&:hover': { textDecoration: 'underline' },
})

const avatarStyle = css({
  width: '1.5em',
  height: '1.5em',
  borderRadius: '999px',
  objectFit: 'cover',
})

const generateRowStyle = css({
  width: '100%',
  minHeight: '3rem',
  borderRadius: '0.25rem',
  border: `1px solid ${colors.light[500]}66`,
  padding: '0.25rem',
  display: 'flex',
})

const generateBtnStyle = css({
  width: '100%',
  background: 'transparent',
  color: colors.light[500],
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
  '&:hover': { color: colors.primary[500] },
})

const emptyRowStyle = css({
  width: '100%',
  minHeight: '3rem',
  borderRadius: '0.25rem',
  border: `1px solid ${colors.light[500]}33`,
})
