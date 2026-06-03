import { css, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { colors } from './theme.ts'

export interface StickerCardSticker {
  id: string
  slug: string
  name: string
  image_url: string
  owner?: {
    username: string
    avatar_url: string | null
  } | null
}

export interface StickerCardProps {
  sticker: StickerCardSticker
  showOwner?: boolean
}

export function StickerCard(handle: Handle<StickerCardProps>) {
  return () => {
    const { sticker, showOwner = true } = handle.props
    return (
      <a href={routes.sticker.href({ slug: sticker.slug })} mix={cardStyle}>
        <div mix={imageWrapStyle}>
          <img src={sticker.image_url} alt={sticker.name} mix={imageStyle} />
        </div>
        <p mix={nameStyle}>{sticker.name}</p>
        {showOwner && sticker.owner ? (
          <p mix={ownerStyle}>
            <img
              src={sticker.owner.avatar_url ?? '/images/default-avatar.webp'}
              alt={sticker.owner.username}
              mix={css({
                width: '1em',
                height: '1em',
                borderRadius: '999px',
                objectFit: 'cover',
              })}
            />
            <span>{sticker.owner.username}</span>
          </p>
        ) : null}
      </a>
    )
  }
}

export function UploadStickerCard() {
  return () => (
    <a href={routes.uploadSticker.index.href()} mix={uploadCardStyle}>
      <img
        src="/images/upload-sticker.webp"
        alt="upload sticker"
        mix={css({ width: '6rem', height: '6rem', opacity: 0.8 })}
      />
      <p mix={css({ marginTop: '0.5rem', fontSize: '0.95rem' })}>upload sticker</p>
    </a>
  )
}

const cardStyle = css({
  display: 'flex',
  flexDirection: 'column',
  width: '12rem',
  padding: '0.5rem',
  border: `2px solid ${colors.light[500]}40`,
  background: '#0e0709',
  '&:hover': { borderColor: colors.primary[500] },
})

const imageWrapStyle = css({
  width: '100%',
  aspectRatio: '1 / 1',
  background: '#000',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
})

const imageStyle = css({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
})

const nameStyle = css({
  marginTop: '0.5rem',
  fontSize: '0.95rem',
  textAlign: 'center',
})

const ownerStyle = css({
  marginTop: '0.25rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.35rem',
  fontSize: '0.85rem',
  opacity: 0.85,
})

const uploadCardStyle = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '12rem',
  height: '15.75rem',
  padding: '0.5rem',
  border: `2px dashed ${colors.light[500]}55`,
  '&:hover': { borderColor: colors.primary[500] },
})
