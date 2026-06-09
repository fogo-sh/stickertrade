import { css, type Handle } from 'remix/ui'

import { routes } from '../../routes.ts'
import { Document } from '../../ui/document.tsx'
import { CsrfField } from '../../ui/form.tsx'
import type { HeaderUser } from '../../ui/header.tsx'
import { colors } from '../../ui/theme.ts'

export interface AdminSurfaceRow {
  id: string
  slug: string
  name: string
  image_url: string
  owner: { username: string; avatar_url: string | null } | null
  createdRelative: string
}

interface AdminSurfacesPageProps {
  user: HeaderUser
  surfaces: AdminSurfaceRow[]
  page: number
  hasNext: boolean
}

export function AdminSurfacesPage(handle: Handle<AdminSurfacesPageProps>) {
  return () => {
    const { user, surfaces, page, hasNext } = handle.props
    return (
    <Document title="stickertrade - admin / surfaces" user={user}>
      <main>
        <div mix={headerStyle}>
          <p mix={css({ fontSize: '1.25rem', fontWeight: 600 })}>surfaces (page {page})</p>
          <nav mix={css({ display: 'flex', gap: '0.5rem' })}>
            {page > 0 ? (
              <a
                href={routes.admin.surfaces.href() + `?page=${page - 1}`}
                mix={navLinkStyle}
              >
                ← prev
              </a>
            ) : null}
            {hasNext ? (
              <a href={routes.admin.surfaces.href() + `?page=${page + 1}`} mix={navLinkStyle}>
                next →
              </a>
            ) : null}
          </nav>
        </div>
        <table mix={tableStyle}>
          <thead>
            <tr>
              <th>preview</th>
              <th>name</th>
              <th>owner</th>
              <th>created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {surfaces.map((s) => (
              <tr key={s.id}>
                <td mix={cellStyle}>
                  <a href={routes.surface.href({ slug: s.slug })}>
                    <img src={s.image_url} alt={s.name} mix={previewStyle} />
                  </a>
                </td>
                <td mix={cellStyle}>
                  <a href={routes.surface.href({ slug: s.slug })} mix={css({ '&:hover': { textDecoration: 'underline' } })}>
                    {s.name}
                  </a>
                </td>
                <td mix={cellStyle}>
                  {s.owner ? (
                    <a href={routes.profile.href({ username: s.owner.username })} mix={userLink}>
                      <img
                        src={s.owner.avatar_url ?? '/images/default-avatar.webp'}
                        alt={s.owner.username}
                        mix={avatarStyle}
                      />
                      <span>{s.owner.username}</span>
                    </a>
                  ) : (
                    <span mix={css({ opacity: 0.6, fontStyle: 'italic' })}>(deleted)</span>
                  )}
                </td>
                <td mix={cellStyle}>{s.createdRelative} ago</td>
                <td mix={cellStyle}>
                  <form method="post" action={routes.admin.deleteSurface.href({ id: s.id })}>
                    <CsrfField />
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
})

const cellStyle = css({ verticalAlign: 'middle' })

const previewStyle = css({
  width: '3rem',
  height: '3rem',
  objectFit: 'cover',
  border: `1px solid ${colors.light[500]}55`,
})

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
