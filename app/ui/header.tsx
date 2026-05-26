import { css, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { colors } from './theme.ts'

export interface HeaderUser {
  username: string
  avatar_url: string | null
  role: string
}

export interface HeaderProps {
  user?: HeaderUser | null
}

export function Header(handle: Handle<HeaderProps>) {
  return () => {
    const user = handle.props.user ?? null
    return (
      <header mix={headerStyle}>
        <a href={routes.home.href()} mix={brandStyle}>
          <img src="/favicon.svg" alt="stickertrade logo" mix={css({ height: '1rem' })} />
          <h1 mix={css({ fontSize: '1.25rem', fontWeight: 600 })}>stickertrade</h1>
        </a>
        <nav mix={navStyle}>
          {user ? <UserMenu user={user} /> : <a href={routes.login.index.href()}>login</a>}
        </nav>
      </header>
    )
  }
}

function UserMenu(handle: Handle<{ user: HeaderUser }>) {
  return () => {
    const { user } = handle.props
    return (
      <div mix={css({ display: 'flex', alignItems: 'center', gap: '1rem' })}>
        <a href={routes.profile.href({ username: user.username })} mix={userLinkStyle}>
          <img
            src={user.avatar_url ?? '/images/default-avatar.webp'}
            alt={user.username}
            mix={avatarStyle}
          />
          <span>{user.username}</span>
        </a>
        <a href={routes.invitations.index.href()} mix={menuLinkStyle}>
          invitations
        </a>
        <a href={routes.changePassword.index.href()} mix={menuLinkStyle}>
          password
        </a>
        {user.role === 'ADMIN' ? (
          <a href={routes.admin.users.href()} mix={menuLinkStyle}>
            admin
          </a>
        ) : null}
        <form method="post" action={routes.logout.href()} mix={css({ display: 'inline' })}>
          <button type="submit" mix={logoutBtnStyle}>
            logout
          </button>
        </form>
      </div>
    )
  }
}

const headerStyle = css({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.5rem',
  margin: '0 auto',
  maxWidth: '36rem',
  borderBottom: `1px solid ${colors.light[500]}`,
  flexWrap: 'wrap',
  gap: '0.5rem',
})

const brandStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  '&:hover': { textDecoration: 'underline' },
})

const navStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  '& a:hover': { textDecoration: 'underline' },
})

const userLinkStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  '&:hover': { textDecoration: 'underline' },
})

const avatarStyle = css({
  width: '1.6em',
  height: '1.6em',
  borderRadius: '999px',
  objectFit: 'cover',
})

const menuLinkStyle = css({
  fontSize: '0.95em',
  opacity: 0.85,
  '&:hover': { opacity: 1, textDecoration: 'underline' },
})

const logoutBtnStyle = css({
  background: 'transparent',
  color: 'inherit',
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
  padding: 0,
  '&:hover': { textDecoration: 'underline' },
})
