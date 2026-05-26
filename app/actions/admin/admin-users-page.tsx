import { css } from 'remix/ui'

import { routes } from '../../routes.ts'
import { Document } from '../../ui/document.tsx'
import type { HeaderUser } from '../../ui/header.tsx'
import { colors } from '../../ui/theme.ts'

export interface AdminUserRow {
  id: string
  username: string
  avatar_url: string | null
  role: string
  createdRelative: string
  updatedRelative: string
}

export function AdminUsersPage() {
  return ({
    user,
    users,
    page,
    hasNext,
  }: {
    user: HeaderUser
    users: AdminUserRow[]
    page: number
    hasNext: boolean
  }) => (
    <Document title="stickertrade - admin / users" user={user}>
      <main>
        <div mix={headerStyle}>
          <p mix={css({ fontSize: '1.25rem', fontWeight: 600 })}>users (page {page})</p>
          <nav mix={css({ display: 'flex', gap: '0.5rem' })}>
            <a href={routes.admin.users.href() + `?page=${Math.max(0, page - 1)}`} mix={navLinkStyle}>
              ← prev
            </a>
            {hasNext ? (
              <a href={routes.admin.users.href() + `?page=${page + 1}`} mix={navLinkStyle}>
                next →
              </a>
            ) : null}
          </nav>
        </div>
        <table mix={tableStyle}>
          <thead>
            <tr>
              <th>username</th>
              <th>role</th>
              <th>created</th>
              <th>updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td mix={cellStyle}>
                  <a href={routes.profile.href({ username: u.username })} mix={userLink}>
                    <img
                      src={u.avatar_url ?? '/images/default-avatar.webp'}
                      alt={u.username}
                      mix={avatarStyle}
                    />
                    <span>{u.username}</span>
                  </a>
                </td>
                <td mix={cellStyle}>{u.role}</td>
                <td mix={cellStyle}>{u.createdRelative} ago</td>
                <td mix={cellStyle}>{u.updatedRelative} ago</td>
                <td mix={cellStyle}>
                  <form method="post" action={routes.admin.deleteUser.href({ id: u.id })}>
                    <button type="submit" mix={dangerBtnStyle}>
                      delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </Document>
  )
}

const headerStyle = css({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '1rem',
  flexWrap: 'wrap',
  gap: '0.5rem',
})

const navLinkStyle = css({
  fontSize: '0.9rem',
  opacity: 0.8,
  '&:hover': { opacity: 1, textDecoration: 'underline' },
})

const tableStyle = css({
  width: '100%',
  borderCollapse: 'collapse',
  '& th, & td': {
    textAlign: 'left',
    padding: '0.4rem 0.5rem',
    borderBottom: `1px solid ${colors.light[500]}33`,
  },
  '& th': { fontWeight: 600 },
})

const cellStyle = css({ verticalAlign: 'middle' })

const userLink = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  '&:hover': { textDecoration: 'underline' },
})

const avatarStyle = css({
  width: '1.4em',
  height: '1.4em',
  borderRadius: '999px',
  objectFit: 'cover',
})

const dangerBtnStyle = css({
  padding: '0.25rem 0.5rem',
  background: 'transparent',
  color: colors.primary[500],
  border: `1px solid ${colors.primary[500]}`,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '0.85rem',
  '&:hover': { background: colors.primary[500], color: colors.dark[500] },
})
