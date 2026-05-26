import { css } from 'remix/ui'

import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { colors } from '../ui/theme.ts'

export interface RoadmapTask {
  id: number
  title: string
  focus?: boolean
  eventually?: boolean
  description?: string // already-rendered HTML
}

export function RoadmapPage() {
  return ({ user, tasks }: { user: HeaderUser | null; tasks: RoadmapTask[] }) => (
    <Document title="stickertrade - roadmap" user={user}>
      <main mix={css({ maxWidth: '32rem', margin: '0 auto' })}>
        <h1 mix={css({ fontSize: '1.5rem', marginBottom: '1rem' })}>roadmap</h1>
        <p mix={css({ fontStyle: 'italic', fontSize: '0.875rem', marginBottom: '0.5rem' })}>
          this is my own little todo list of things to get done.
        </p>
        <ul mix={listStyle}>
          {tasks.map((task) => (
            <li key={task.id} mix={task.eventually ? eventuallyStyle : itemStyle}>
              {task.focus ? '🎯 ' : ''}
              {task.title}
              {task.description ? <div mix={markdownStyle} innerHTML={task.description} /> : null}
            </li>
          ))}
        </ul>
        <p mix={css({ marginTop: '0.75rem', fontSize: '0.875rem' })}>
          🎯 means <span mix={css({ color: colors.primary[500] })}>focus</span>
        </p>
        <p mix={css({ fontSize: '0.875rem' })}>
          smaller and faded means <span mix={css({ color: colors.secondary[500] })}>eventually</span>
        </p>
      </main>
    </Document>
  )
}

const listStyle = css({
  paddingLeft: '1rem',
  listStyleType: 'disc',
})

const itemStyle = css({ margin: '0.25rem 0' })

const eventuallyStyle = css({
  margin: '0.25rem 0',
  opacity: 0.7,
  fontSize: '0.875rem',
})

const markdownStyle = css({
  padding: '0 1rem',
  '& ul': { listStyle: 'disc', paddingLeft: '1.25rem' },
  '& li': { margin: '0.15rem 0' },
})
