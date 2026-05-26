import { css } from 'remix/ui'

import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { UserCard, type UserCardUser } from '../ui/user-card.tsx'

export function UsersPage() {
  return ({ user, users }: { user: HeaderUser | null; users: UserCardUser[] }) => (
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

const heading = css({
  fontSize: '1.5rem',
  fontWeight: 600,
  margin: '0.5rem 0 2rem',
})

const grid = css({ display: 'flex', flexWrap: 'wrap', gap: '2rem' })
