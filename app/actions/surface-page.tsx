import { css, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import { CsrfField } from '../ui/form.tsx'
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
    owner: { username: string; avatar_url: string | null }
  }
  images: Array<{
    id: string
    image_url: string
    is_primary: boolean
  }>
  canEdit: boolean
}

export function SurfacePage(handle: Handle<SurfacePageProps>) {
  return () => {
    const { user, surface, images, canEdit } = handle.props
    const description = surface.description ?? `A sticker surface by ${surface.owner.username}.`
    const primaryImage = images[0]
    const galleryImages = images.slice(1)
    return (
      <Document
        title={`stickertrade - ${surface.name}`}
        user={user}
        og={{
          title: surface.name,
          description,
          image: primaryImage?.image_url ?? '/images/banner.png',
          url: routes.surface.href({ slug: surface.slug }),
          type: 'article',
        }}
      >
        <main mix={css({ maxWidth: '40rem', margin: '0 auto' })}>
          {primaryImage ? (
            <div mix={imageWrapStyle}>
              <img src={primaryImage.image_url} alt={surface.name} mix={imageStyle} />
            </div>
          ) : null}
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
          {galleryImages.length > 0 ? (
            <section mix={gallerySectionStyle}>
              {galleryImages.map((img) => (
                <div key={img.id} mix={imageWrapStyle}>
                  <img src={img.image_url} alt="" mix={imageStyle} />
                </div>
              ))}
            </section>
          ) : null}
          {canEdit ? (
            <div mix={actionsRowStyle}>
              <a href={routes.editSurface.index.href({ slug: surface.slug })} mix={editLink}>
                edit this surface
              </a>
              <form
                method="post"
                action={routes.removeSurface.action.href({
                  username: surface.owner.username,
                  surfaceId: surface.id,
                })}
                mix={css({ display: 'inline' })}
              >
                <CsrfField />
                <button type="submit" mix={removeButtonStyle}>
                  remove
                </button>
              </form>
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

const gallerySectionStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  marginTop: '1.5rem',
})

const actionsRowStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  marginTop: '1.25rem',
})

const editLink = css({
  display: 'inline-block',
  padding: '0.4rem 0.75rem',
  border: `1px solid ${colors.light[500]}55`,
  '&:hover': { borderColor: colors.primary[500], color: colors.primary[500] },
})

const removeButtonStyle = css({
  padding: '0.4rem 0.75rem',
  background: 'transparent',
  color: colors.light[500],
  border: `1px solid ${colors.light[500]}55`,
  cursor: 'pointer',
  font: 'inherit',
  '&:hover': { borderColor: colors.primary[500], color: colors.primary[500] },
})
