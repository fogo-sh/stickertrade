import { css, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { colors } from '../ui/theme.ts'

interface DevLogPageProps {
  user: HeaderUser | null
  log: { slug: string; title: string; dateString: string; html: string }
}

export function DevLogPage(handle: Handle<DevLogPageProps>) {
  return () => {
    const { user, log } = handle.props
    return (
    <Document
      title={`stickertrade - dev log | ${log.title}`}
      user={user}
      og={{
        title: log.title,
        description: `stickertrade dev log from ${log.dateString}`,
        url: routes.devLog.href({ slug: log.slug }),
        type: 'article',
      }}
    >
      <main mix={css({ maxWidth: '32rem', margin: '0 auto' })}>
        <h1 mix={css({ fontSize: '1.5rem', marginBottom: '0.5rem' })}>dev log {log.title}</h1>
        <p mix={css({ fontStyle: 'italic', opacity: 0.6, marginBottom: '1rem' })}>
          {log.dateString}
        </p>
        <div mix={markdownStyle} innerHTML={log.html} />
      </main>
    </Document>
    )
  }
}

const markdownStyle = css({
  '& h1, & h2, & h3': { margin: '1rem 0 0.5rem', fontWeight: 600 },
  '& h1': { fontSize: '1.5rem' },
  '& h2': { fontSize: '1.25rem' },
  '& h3': { fontSize: '1.125rem' },
  '& p': { margin: '0.5rem 0' },
  '& ul, & ol': { paddingLeft: '1.25rem', margin: '0.5rem 0' },
  '& li': { margin: '0.25rem 0' },
  '& code': {
    background: colors.dark[400],
    padding: '0.1rem 0.3rem',
    fontSize: '0.9em',
  },
  '& pre': {
    background: colors.dark[400],
    padding: '0.75rem',
    overflow: 'auto',
  },
  '& a': { textDecoration: 'underline', color: colors.primary[500] },
  '& img': { maxWidth: '100%' },
  '& blockquote': {
    margin: '0.5rem 0',
    paddingLeft: '0.75rem',
    borderLeft: `2px solid ${colors.light[500]}55`,
    opacity: 0.85,
  },
})
