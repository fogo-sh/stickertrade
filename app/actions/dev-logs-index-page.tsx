import { css } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { colors } from '../ui/theme.ts'

export interface DevLogSummary {
  slug: string
  title: string
  dateString: string
}

export function DevLogsIndexPage() {
  return ({ user, logs }: { user: HeaderUser | null; logs: DevLogSummary[] }) => (
    <Document title="stickertrade - dev logs" user={user}>
      <main mix={css({ maxWidth: '32rem', margin: '0 auto' })}>
        <h1 mix={css({ fontSize: '1.5rem', marginBottom: '1rem' })}>dev logs</h1>
        <p mix={css({ marginBottom: '0.5rem' })}>a collection of dev logs regarding stickertrade.</p>
        <p mix={css({ marginBottom: '1rem', fontSize: '0.9rem' })}>
          feed available as:{' '}
          <a href={routes.devLogsRss.href()} mix={feedLinkStyle}>
            rss
          </a>{' '}
          -{' '}
          <a href={routes.devLogsAtom.href()} mix={feedLinkStyle}>
            atom
          </a>{' '}
          -{' '}
          <a href={routes.devLogsJson.href()} mix={feedLinkStyle}>
            json
          </a>
        </p>
        <ul mix={css({ listStyle: 'none', padding: 0, margin: 0 })}>
          {logs.map((log) => (
            <li key={log.slug} mix={listItem}>
              <a href={routes.devLog.href({ slug: log.slug })} mix={rowStyle}>
                <span>{log.title}</span>
                <span mix={css({ opacity: 0.7, fontSize: '0.875rem' })}>{log.dateString}</span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </Document>
  )
}

const feedLinkStyle = css({
  textDecoration: 'underline',
  '&:hover': { color: colors.primary[500] },
})

const listItem = css({
  borderTop: `1px solid ${colors.light[500]}33`,
  '&:last-child': { borderBottom: `1px solid ${colors.light[500]}33` },
})

const rowStyle = css({
  display: 'flex',
  justifyContent: 'space-between',
  padding: '0.5rem 0',
  '&:hover': { textDecoration: 'underline' },
})
