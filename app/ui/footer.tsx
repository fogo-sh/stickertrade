import { css } from 'remix/ui'

import { routes } from '../routes.ts'

export function Footer() {
  return () => (
    <footer mix={footerStyle}>
      <div mix={linksStyle}>
        <a href={routes.brand.href()}>brand</a>
        <a href={routes.roadmap.href()}>roadmap</a>
        <a href={routes.devLogsIndex.href()}>dev logs</a>
        <a href="https://github.com/fogo-sh/stickertrade" rel="noreferrer">
          github
        </a>
      </div>
      <p mix={css({ fontSize: '0.8rem', opacity: 0.6 })}>
        made with care by{' '}
        <a href="https://jackharrhy.com" rel="noreferrer">
          jack harrhy
        </a>
      </p>
    </footer>
  )
}

const footerStyle = css({
  maxWidth: '36rem',
  margin: '2rem auto 0',
  padding: '1rem',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
})

const linksStyle = css({
  display: 'flex',
  justifyContent: 'center',
  gap: '1rem',
  flexWrap: 'wrap',
  '& a:hover': { textDecoration: 'underline' },
})
