import { css } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { StickerCard, UploadStickerCard, type StickerCardSticker } from '../ui/sticker-card.tsx'
import { colors } from '../ui/theme.ts'
import { UserCard, type UserCardUser } from '../ui/user-card.tsx'

export interface HomePageProps {
  user: HeaderUser | null
  stickers: StickerCardSticker[]
  users: UserCardUser[]
}

export function HomePage() {
  return ({ user, stickers, users }: HomePageProps) => (
    <Document
      user={user}
      og={{
        title: 'stickertrade',
        description: 'invite-only sticker trading site',
        url: routes.home.href(),
      }}
    >
      <main>
        <a href={routes.stickers.href()} mix={sectionHeading}>
          recently posted stickers
        </a>
        <div mix={gridStyle}>
          {stickers.map((sticker) => (
            <StickerCard key={sticker.id} sticker={sticker} />
          ))}
          {user ? <UploadStickerCard /> : null}
        </div>
        <div mix={seeAllStyle}>
          <a href={routes.stickers.href()} mix={seeAllLinkStyle}>
            see all stickers →
          </a>
        </div>

        <a href={routes.users.href()} mix={[sectionHeading, css({ marginTop: '3rem' })]}>
          recently active users
        </a>
        <div mix={gridStyle}>
          {users.map((u) => (
            <UserCard key={u.username} user={u} />
          ))}
        </div>
        <div mix={seeAllStyle}>
          <a href={routes.users.href()} mix={seeAllLinkStyle}>
            see all users →
          </a>
        </div>
      </main>
    </Document>
  )
}

const sectionHeading = css({
  display: 'inline-block',
  fontSize: '1.125rem',
  fontWeight: 600,
  margin: '1rem 0',
  '&:hover': { textDecoration: 'underline', color: colors.primary[500] },
})

const gridStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '1.5rem',
})

const seeAllStyle = css({
  marginTop: '1rem',
})

const seeAllLinkStyle = css({
  fontSize: '0.9rem',
  opacity: 0.75,
  '&:hover': { opacity: 1, textDecoration: 'underline', color: colors.primary[500] },
})
