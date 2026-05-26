import { css, type RemixNode } from 'remix/ui'

import { routes } from '../routes.ts'
import { colors } from './theme.ts'
import { Header, type HeaderUser } from './header.tsx'
import { Footer } from './footer.tsx'

export interface DocumentProps {
  children?: RemixNode
  head?: RemixNode
  title?: string
  user?: HeaderUser | null
  showChrome?: boolean
}

const DEFAULT_TITLE = 'stickertrade'

export function Document() {
  return ({
    children,
    head,
    title = DEFAULT_TITLE,
    user = null,
    showChrome = true,
  }: DocumentProps) => (
    <html lang="en" mix={css({ height: '100%' })}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <meta property="og:image" content="/images/banner.png" />
        <title>{title}</title>
        {head}
      </head>
      <body mix={bodyStyle}>
        <div mix={shellStyle}>
          {showChrome ? <Header user={user} /> : null}
          {showChrome ? <WipBanner /> : null}
          <div mix={css({ paddingTop: '1.25rem', paddingBottom: '2rem' })}>{children}</div>
        </div>
        {showChrome ? <Footer /> : null}
        <script type="module" src={routes.assets.href({ path: 'app/assets/entry.ts' })}></script>
      </body>
    </html>
  )
}

const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

const bodyStyle = css({
  margin: 0,
  padding: '1rem',
  minHeight: '100%',
  background: colors.dark[500],
  color: colors.light[500],
  fontFamily: FONT_STACK,
  fontSize: '16px',
  lineHeight: 1.5,
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  '& *, & *::before, & *::after': { boxSizing: 'border-box' },
  '& a': { color: 'inherit', textDecoration: 'none' },
  '& h1, & h2, & h3, & h4, & h5, & h6, & p, & ul, & ol': { margin: 0 },
})

const shellStyle = css({
  margin: '0 auto',
  padding: '0 1rem',
  minHeight: '92.75vh',
  maxWidth: '80rem',
})

function WipBanner() {
  return () => (
    <div mix={css({ display: 'flex', flexDirection: 'column', alignItems: 'center' })}>
      <p
        mix={css({
          background: '#ef4444',
          color: colors.dark[500],
          fontSize: '1.25rem',
          margin: '2rem 0.5rem 0',
          padding: '0.75rem',
          textAlign: 'center',
          '& a': { textDecoration: 'underline' },
        })}
      >
        <b>WARNING:</b>
        <br />
        this site is currently a work in progress
        <br />
        if you want an invite, reach out to me!
        <br />
        <a href="mailto:me@jackharrhy.com">me@jackharrhy.com</a>
      </p>
    </div>
  )
}
