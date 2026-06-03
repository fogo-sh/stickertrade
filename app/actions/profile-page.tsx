import { css } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import { CsrfField } from '../ui/form.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { StickerCard, UploadStickerCard } from '../ui/sticker-card.tsx'
import {
  SurfaceCard,
  UploadSurfaceCard,
  type SurfaceCardSurface,
} from '../ui/surface-card.tsx'
import { colors } from '../ui/theme.ts'

export interface ProfilePageProps {
  user: HeaderUser | null
  profile: {
    username: string
    avatar_url: string | null
    stickers: { id: string; slug: string; name: string; image_url: string }[]
    surfaces: SurfaceCardSurface[]
  }
}

export function ProfilePage() {
  return ({ user, profile }: ProfilePageProps) => {
    const isOwner = user?.username === profile.username
    const stickerCount = profile.stickers.length
    return (
      <Document
        title={`stickertrade - ${profile.username}`}
        user={user}
        og={{
          title: `${profile.username} on stickertrade`,
          description:
            stickerCount === 0
              ? `${profile.username} hasn't uploaded any stickers yet`
              : `${stickerCount} sticker${stickerCount === 1 ? '' : 's'} by ${profile.username}`,
          image: profile.avatar_url ?? '/images/default-avatar.webp',
          url: routes.profile.href({ username: profile.username }),
          type: 'profile',
        }}
      >
        <main>
          <div mix={profileHeaderStyle}>
            <img
              src={profile.avatar_url ?? '/images/default-avatar.webp'}
              alt={profile.username}
              mix={avatarStyle}
            />
            <h1 mix={css({ fontSize: '1.5rem' })}>{profile.username}</h1>
          </div>
          <p mix={sectionHeading}>stickers</p>
          {profile.stickers.length === 0 && !isOwner ? (
            <p mix={css({ fontStyle: 'italic', marginBottom: '0.75rem' })}>no stickers</p>
          ) : null}
          <div mix={gridStyle}>
            {isOwner ? <UploadStickerCard /> : null}
            {profile.stickers.map((sticker) => (
              <div key={sticker.id} mix={css({ position: 'relative' })}>
                {isOwner ? (
                  <div mix={overlayStyle}>
                    <a
                      href={routes.editSticker.index.href({ slug: sticker.slug })}
                      mix={editBtnStyle}
                      aria-label="edit sticker"
                    >
                      ✎
                    </a>
                    <form
                      method="post"
                      action={routes.removeSticker.action.href({
                        username: profile.username,
                        stickerId: sticker.id,
                      })}
                      mix={css({ display: 'inline' })}
                    >
                      <CsrfField />
                      <button type="submit" mix={removeBtnStyle} aria-label="remove sticker">
                        ✕
                      </button>
                    </form>
                  </div>
                ) : null}
                <StickerCard sticker={sticker} showOwner={false} />
              </div>
            ))}
          </div>
          {isOwner || profile.surfaces.length > 0 ? (
            <section mix={surfacesSectionStyle}>
              <p mix={sectionHeading}>
                surfaces{profile.surfaces.length > 0 ? ` (${profile.surfaces.length})` : ''}
              </p>
              {profile.surfaces.map((s) => (
                <SurfaceCard key={s.id} surface={s} showOwner={false} />
              ))}
              {isOwner ? <UploadSurfaceCard /> : null}
            </section>
          ) : null}
        </main>
      </Document>
    )
  }
}

const profileHeaderStyle = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.5rem',
  marginTop: '1rem',
})

const avatarStyle = css({
  width: '6em',
  height: '6em',
  borderRadius: '999px',
  objectFit: 'cover',
})

const sectionHeading = css({
  fontSize: '1.125rem',
  fontWeight: 600,
  margin: '1rem 0',
})

const gridStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '1.5rem',
})

const surfacesSectionStyle = css({ marginTop: '2rem', maxWidth: '600px' })

const overlayStyle = css({
  position: 'absolute',
  top: '0.25rem',
  right: '0.25rem',
  zIndex: 1,
  display: 'flex',
  gap: '0.25rem',
})

const editBtnStyle = css({
  width: '1.5rem',
  height: '1.5rem',
  borderRadius: '999px',
  background: colors.light[500],
  color: colors.dark[500],
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 700,
  lineHeight: '1.5rem',
  textAlign: 'center',
  textDecoration: 'none',
  '&:hover': { background: colors.primary[500] },
})

const removeBtnStyle = css({
  width: '1.5rem',
  height: '1.5rem',
  borderRadius: '999px',
  background: colors.light[500],
  color: colors.dark[500],
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 700,
  lineHeight: 1,
  '&:hover': { background: colors.primary[500] },
})
