import { css } from 'remix/ui'

import { Document } from '../ui/document.tsx'
import { colors } from '../ui/theme.ts'
import type { HeaderUser } from '../ui/header.tsx'

export function BrandPage() {
  return ({ user }: { user: HeaderUser | null }) => (
    <Document title="stickertrade - brand" user={user}>
      <main mix={css({ maxWidth: '42rem', margin: '0 auto' })}>
        <h1 mix={h1}>brand</h1>
        <h2 mix={h2}>logo</h2>
        <img
          src="/favicon.svg"
          alt="stickertrade logo"
          mix={css({ width: '10rem', margin: '0.5rem auto', display: 'block' })}
        />
        <h2 mix={h2}>banner</h2>
        <div mix={bannerStyle}>
          <img src="/favicon.svg" alt="stickertrade logo" mix={css({ height: '4rem' })} />
          <p mix={css({ fontSize: '3.5rem', fontWeight: 600 })}>stickertrade</p>
        </div>
        <p mix={italic}>as html</p>
        <img src="/images/banner.png" alt="stickertrade banner" mix={bannerImgStyle} />
        <p mix={italic}>as png</p>
        <h2 mix={h2}>colors</h2>
        <div mix={colorsRow}>
          {Object.entries(colors).map(([key, value]) => (
            <div key={key} mix={css({ display: 'flex', flexDirection: 'column', gap: '0.5rem' })}>
              {Object.entries(value).map(([variant, color]) => (
                <div key={variant} mix={css({ textAlign: 'center' })}>
                  <div
                    style={{ backgroundColor: color }}
                    mix={css({
                      width: '7rem',
                      height: '7rem',
                      border: `2px solid ${colors.light[500]}80`,
                    })}
                  />
                  <p mix={css({ fontSize: '0.85rem', marginTop: '0.5rem' })}>{`${key}-${variant}`}</p>
                  <code>{color}</code>
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </Document>
  )
}

const h1 = css({ fontSize: '1.5rem', marginBottom: '0.5rem' })
const h2 = css({ fontSize: '1.25rem', marginTop: '1rem', marginBottom: '1rem' })
const italic = css({ fontStyle: 'italic', opacity: 0.7, marginTop: '0.25rem' })
const bannerStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1.25rem',
  border: `1px solid ${colors.light[500]}`,
  marginTop: '1rem',
  padding: '4rem 0',
})
const bannerImgStyle = css({
  border: `1px solid ${colors.light[500]}`,
  display: 'block',
  maxWidth: '100%',
})
const colorsRow = css({
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: '1rem',
})
