import { css, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { colors } from './theme.ts'

export interface SurfaceCardSurface {
  id: string
  slug: string
  name: string
  description: string | null
  image_url: string
  owner: {
    username: string
    avatar_url: string | null
  }
}

export interface SurfaceCardProps {
  surface: SurfaceCardSurface
  showOwner?: boolean
  /**
   * Compact mode caps the image at ~22rem tall and uses `object-fit: cover`
   * so featured-in-a-list contexts (Surface of the Day on home) don't
   * dominate the viewport with portrait or square photos.
   */
  compact?: boolean
}

const PREVIEW_LIMIT = 120

export function SurfaceCard(handle: Handle<SurfaceCardProps>) {
  return () => {
    const { surface, showOwner = true, compact = false } = handle.props
    const preview =
      surface.description && surface.description.length > PREVIEW_LIMIT
        ? surface.description.slice(0, PREVIEW_LIMIT) + '…'
        : surface.description
    return (
      <a href={routes.surface.href({ slug: surface.slug })} mix={cardStyle}>
        <div mix={imageWrapStyle}>
          <img
            src={surface.image_url}
            alt={surface.name}
            mix={compact ? compactImageStyle : imageStyle}
          />
        </div>
        <p mix={nameStyle}>{surface.name}</p>
        {showOwner ? (
          <p mix={ownerStyle}>
            <img
              src={surface.owner.avatar_url ?? '/images/default-avatar.webp'}
              alt={surface.owner.username}
              mix={css({
                width: '1em',
                height: '1em',
                borderRadius: '999px',
                objectFit: 'cover',
              })}
            />
            <span>{surface.owner.username}</span>
          </p>
        ) : null}
        {preview ? <p mix={descriptionStyle}>{preview}</p> : null}
      </a>
    )
  }
}

export function UploadSurfaceCard() {
  return () => (
    <a href={routes.uploadSurface.index.href()} mix={uploadCardStyle}>
      <span mix={uploadIconStyle}>+</span>
      <span>upload a surface</span>
    </a>
  )
}

const cardStyle = css({
  display: 'block',
  width: '100%',
  marginBottom: '2rem',
  padding: '0.5rem',
  border: `2px solid ${colors.light[500]}40`,
  background: '#0e0709',
  textDecoration: 'none',
  color: 'inherit',
  '&:hover': { borderColor: colors.primary[500] },
})

const uploadCardStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  width: '100%',
  marginBottom: '2rem',
  padding: '2rem 0.5rem',
  border: `2px dashed ${colors.light[500]}55`,
  textDecoration: 'none',
  color: 'inherit',
  opacity: 0.85,
  '&:hover': { borderColor: colors.primary[500], opacity: 1 },
})

const uploadIconStyle = css({
  fontSize: '1.5rem',
  fontWeight: 700,
  lineHeight: 1,
})

const imageWrapStyle = css({
  width: '100%',
  background: '#000',
})

const imageStyle = css({
  width: '100%',
  height: 'auto',
  display: 'block',
})

const compactImageStyle = css({
  width: '100%',
  maxHeight: '22rem',
  objectFit: 'cover',
  display: 'block',
})

const nameStyle = css({
  marginTop: '0.5rem',
  fontSize: '1rem',
  fontWeight: 600,
})

const ownerStyle = css({
  marginTop: '0.25rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  fontSize: '0.85rem',
  opacity: 0.85,
})

const descriptionStyle = css({
  marginTop: '0.5rem',
  fontSize: '0.9rem',
  opacity: 0.85,
  lineHeight: 1.4,
})
