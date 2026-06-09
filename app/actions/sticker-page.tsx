import { css, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { UserCard } from '../ui/user-card.tsx'
import { colors } from '../ui/theme.ts'

export interface StickerPageProps {
  user: HeaderUser | null
  sticker: {
    id: string
    slug: string
    name: string
    image_url: string
    owner: { username: string; avatar_url: string | null } | null
  }
}

export function StickerPage(handle: Handle<StickerPageProps>) {
  return () => {
    const { user, sticker } = handle.props
    const canEdit =
      user != null && (user.username === sticker.owner?.username || user.role === 'ADMIN')
    const ownerLabel = sticker.owner ? `by ${sticker.owner.username}` : '(no owner)'
    return (
      <Document
        title={`stickertrade - ${sticker.name}`}
        user={user}
        og={{
          title: sticker.name,
          description: `sticker ${ownerLabel}`,
          image: sticker.image_url,
          url: routes.sticker.href({ slug: sticker.slug }),
          type: 'article',
        }}
      >
        <main mix={css({ maxWidth: '32rem', margin: '0 auto' })}>
          <div mix={imageWrapStyle}>
            <img src={sticker.image_url} alt={sticker.name} mix={imageStyle} />
          </div>
          <h1 mix={titleStyle}>{sticker.name}</h1>
          {sticker.owner ? (
            <div mix={ownerWrapStyle}>
              <h2 mix={css({ fontSize: '1rem' })}>owned by</h2>
              <UserCard user={sticker.owner} />
              <a href={routes.profile.href({ username: sticker.owner.username })} mix={profileLink}>
                view profile
              </a>
            </div>
          ) : null}
          {canEdit ? (
            <div mix={css({ textAlign: 'center', marginTop: '1.25rem' })}>
              <a href={routes.editSticker.index.href({ slug: sticker.slug })} mix={editLink}>
                edit this sticker
              </a>
            </div>
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
  fontSize: '1.25rem',
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

const editLink = css({
  display: 'inline-block',
  padding: '0.4rem 0.75rem',
  border: `1px solid ${colors.light[500]}55`,
  '&:hover': { borderColor: colors.primary[500], color: colors.primary[500] },
})
