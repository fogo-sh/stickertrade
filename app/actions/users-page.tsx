import { css, type Handle } from 'remix/ui'

import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { UserCard, type UserCardUser } from '../ui/user-card.tsx'

interface UsersPageProps {
  user: HeaderUser | null
  users: UserCardUser[]
}

export function UsersPage(handle: Handle<UsersPageProps>) {
  return () => {
    const { user, users } = handle.props
    return (
    <Document title="stickertrade - users" user={user}>
      <main>
        <p mix={heading}>users</p>
        <div mix={grid}>
          {users.map((u) => (
            <UserCard key={u.username} user={u} />
          ))}
        </div>
      </main>
    </Document>
    )
  }
}

const heading = css({
  fontSize: '1.5rem',
  fontWeight: 600,
  margin: '0.5rem 0 2rem',
})

const grid = css({ display: 'flex', flexWrap: 'wrap', gap: '2rem' })
