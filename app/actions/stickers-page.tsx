import { css, type Handle } from 'remix/ui'

import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { StickerCard, type StickerCardSticker } from '../ui/sticker-card.tsx'

interface StickersPageProps {
  user: HeaderUser | null
  stickers: StickerCardSticker[]
}

export function StickersPage(handle: Handle<StickersPageProps>) {
  return () => {
    const { user, stickers } = handle.props
    return (
    <Document title="stickertrade - stickers" user={user}>
      <main>
        <p mix={heading}>stickers</p>
        <div mix={grid}>
          {stickers.map((sticker) => (
            <StickerCard key={sticker.id} sticker={sticker} />
          ))}
        </div>
      </main>
    </Document>
    )
  }
}

const heading = css({
  fontSize: '1.5rem',
  fontWeight: 600,
  margin: '0.5rem 0 2rem',
})

const grid = css({ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' })
