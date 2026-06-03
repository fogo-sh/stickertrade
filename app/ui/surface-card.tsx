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
}

const PREVIEW_LIMIT = 120

export function SurfaceCard(handle: Handle<SurfaceCardProps>) {
  return () => {
    const { surface } = handle.props
    const preview =
      surface.description && surface.description.length > PREVIEW_LIMIT
        ? surface.description.slice(0, PREVIEW_LIMIT) + '…'
        : surface.description
    return (
      <a href={routes.surface.href({ slug: surface.slug })} mix={cardStyle}>
        <div mix={imageWrapStyle}>
          <img src={surface.image_url} alt={surface.name} mix={imageStyle} />
        </div>
        <p mix={nameStyle}>{surface.name}</p>
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
        {preview ? <p mix={descriptionStyle}>{preview}</p> : null}
      </a>
    )
  }
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

const imageWrapStyle = css({
  width: '100%',
  background: '#000',
})

const imageStyle = css({
  width: '100%',
  height: 'auto',
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
