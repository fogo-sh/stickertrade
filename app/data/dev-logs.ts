import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { marked } from 'marked'

const require_ = createRequire(import.meta.url)
const parseFrontMatter = require_('front-matter') as <T>(
  contents: string,
) => { attributes: T; body: string }

export interface DevLog {
  slug: string
  title: string
  date: Date
  dateString: string
  html: string
}

interface DevLogFrontMatter {
  title: string
  date: string
}

function isValidFrontMatter(attributes: unknown): attributes is DevLogFrontMatter {
  if (typeof attributes !== 'object' || attributes === null) return false
  const a = attributes as Record<string, unknown>
  return typeof a.title === 'string' && typeof a.date === 'string'
}

const DEV_LOGS_DIR = path.resolve(process.cwd(), 'dev-logs')

let cached: DevLog[] | null = null

function loadAll(): DevLog[] {
  if (cached && process.env.NODE_ENV === 'production') return cached
  const filenames = fs.readdirSync(DEV_LOGS_DIR).filter((f) => f.endsWith('.md'))
  const logs = filenames.map((filename) => {
    const filePath = path.join(DEV_LOGS_DIR, filename)
    const raw = fs.readFileSync(filePath, 'utf8')
    const { attributes, body } = parseFrontMatter<unknown>(raw)
    if (!isValidFrontMatter(attributes)) {
      throw new Error(`Dev log ${filename} is missing title or date front-matter`)
    }
    const html = marked.parse(body, { async: false }) as string
    return {
      slug: filename.replace(/\.md$/, ''),
      title: attributes.title,
      date: new Date(attributes.date),
      dateString: attributes.date,
      html,
    }
  })
  logs.sort((a, b) => b.date.getTime() - a.date.getTime())
  cached = logs
  return logs
}

export function getDevLogs(): DevLog[] {
  return loadAll().map(({ html: _ignored, ...rest }) => ({ ...rest, html: '' }))
}

export function getAllDevLogsWithHtml(): DevLog[] {
  return loadAll()
}

export function getDevLog(slug: string): DevLog | null {
  return loadAll().find((log) => log.slug === slug) ?? null
}
