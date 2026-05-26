import { css, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { colors } from './theme.ts'

export interface UserCardUser {
  username: string
  avatar_url: string | null
}

export function UserCard(handle: Handle<{ user: UserCardUser; dark?: boolean }>) {
  return () => {
    const { user, dark = false } = handle.props
    return (
      <a
        href={routes.profile.href({ username: user.username })}
        mix={[cardBaseStyle, dark ? darkVariant : lightVariant]}
      >
        <img
          src={user.avatar_url ?? '/images/default-avatar.webp'}
          alt={user.username}
          mix={css({
            width: '2rem',
            height: '2rem',
            borderRadius: '999px',
            objectFit: 'cover',
          })}
        />
        <span>{user.username}</span>
      </a>
    )
  }
}

const cardBaseStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.4rem 0.6rem',
  border: `1px solid ${colors.light[500]}40`,
  '&:hover': { textDecoration: 'underline' },
})

const lightVariant = css({})

const darkVariant = css({
  background: colors.light[500],
  color: colors.dark[500],
})
