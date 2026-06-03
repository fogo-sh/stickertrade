import { css } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { UserCard } from '../ui/user-card.tsx'
import { colors } from '../ui/theme.ts'

export interface SurfacePageProps {
  user: HeaderUser | null
  surface: {
    id: string
    slug: string
    name: string
    description: string | null
    image_url: string
    owner: { username: string; avatar_url: string | null }
  }
}

export function SurfacePage() {
  return ({ user, surface }: SurfacePageProps) => {
    const description = surface.description ?? `A sticker surface by ${surface.owner.username}.`
    return (
      <Document
        title={`stickertrade - ${surface.name}`}
        user={user}
        og={{
          title: surface.name,
          description,
          image: surface.image_url,
          url: routes.surface.href({ slug: surface.slug }),
          type: 'article',
        }}
      >
        <main mix={css({ maxWidth: '40rem', margin: '0 auto' })}>
          <div mix={imageWrapStyle}>
            <img src={surface.image_url} alt={surface.name} mix={imageStyle} />
          </div>
          <h1 mix={titleStyle}>{surface.name}</h1>
          <div mix={ownerWrapStyle}>
            <h2 mix={css({ fontSize: '1rem' })}>owned by</h2>
            <UserCard user={surface.owner} />
            <a href={routes.profile.href({ username: surface.owner.username })} mix={profileLink}>
              view profile
            </a>
          </div>
          {surface.description ? (
            <p mix={descriptionStyle}>{surface.description}</p>
          ) : null}
        </main>
      </Document>
    )
  }
}

const imageWrapStyle = css({
  width: '100%',
  border: `2px solid ${colors.light[500]}40`,
  background: '#000',
})

const imageStyle = css({
  width: '100%',
  display: 'block',
})

const titleStyle = css({
  fontSize: '1.5rem',
  textAlign: 'center',
  margin: '1rem 0',
})

const ownerWrapStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  flexWrap: 'wrap',
})

const profileLink = css({
  opacity: 0.7,
  fontSize: '0.85rem',
  '&:hover': { textDecoration: 'underline' },
})

const descriptionStyle = css({
  marginTop: '1.5rem',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.5,
})
