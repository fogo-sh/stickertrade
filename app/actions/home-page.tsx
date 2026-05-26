import { css } from 'remix/ui'

import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { StickerCard, UploadStickerCard, type StickerCardSticker } from '../ui/sticker-card.tsx'
import { UserCard, type UserCardUser } from '../ui/user-card.tsx'

export interface HomePageProps {
  user: HeaderUser | null
  stickers: StickerCardSticker[]
  users: UserCardUser[]
}

export function HomePage() {
  return ({ user, stickers, users }: HomePageProps) => (
    <Document user={user}>
      <main>
        <p mix={sectionHeading}>recently posted stickers</p>
        <div mix={gridStyle}>
          {stickers.map((sticker) => (
            <StickerCard key={sticker.id} sticker={sticker} />
          ))}
          {user ? <UploadStickerCard /> : null}
        </div>
        <p mix={[sectionHeading, css({ marginTop: '3rem' })]}>recently active users</p>
        <div mix={gridStyle}>
          {users.map((u) => (
            <UserCard key={u.username} user={u} />
          ))}
        </div>
      </main>
    </Document>
  )
}

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
