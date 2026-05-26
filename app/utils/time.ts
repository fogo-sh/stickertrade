const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 1000 * 60 * 60 * 24 * 365],
  ['month', 1000 * 60 * 60 * 24 * 30],
  ['day', 1000 * 60 * 60 * 24],
  ['hour', 1000 * 60 * 60],
  ['minute', 1000 * 60],
  ['second', 1000],
]

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/**
 * Format a timestamp as "5 minutes" or similar — no leading "in" or "ago",
 * since callers wrap the value to read like "{relative} ago".
 */
export function formatRelative(when: number | Date): string {
  const target = typeof when === 'number' ? when : when.getTime()
  const diff = Math.abs(Date.now() - target)
  for (const [unit, ms] of UNITS) {
    if (diff >= ms || unit === 'second') {
      const value = Math.max(1, Math.floor(diff / ms))
      const formatted = rtf.format(-value, unit)
      // strip leading "in " / trailing " ago"
      return formatted.replace(/^in\s+/, '').replace(/\s+ago$/, '')
    }
  }
  return 'just now'
}
