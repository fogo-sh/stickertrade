/**
 * Resolves the public origin used to build absolute URLs (e.g. og:image,
 * og:url). Defaults to localhost for dev; configure PUBLIC_ORIGIN in prod
 * (this is the same env var the CSRF middleware uses for origin matching).
 *
 * If PUBLIC_ORIGIN is comma-separated (multiple allowed origins for CSRF),
 * the first entry is used as the canonical public URL.
 */
function resolveDefaultOrigin(): string {
  const raw = process.env.PUBLIC_ORIGIN
  if (!raw) return `http://localhost:${process.env.PORT ?? '44100'}`
  const first = raw.split(',').map((v) => v.trim()).find((v) => v.length > 0)
  return first ?? `http://localhost:${process.env.PORT ?? '44100'}`
}

const DEFAULT_ORIGIN = resolveDefaultOrigin()

export function getPublicOrigin(): string {
  return DEFAULT_ORIGIN
}

/** Make a relative path absolute against the configured public origin. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const origin = DEFAULT_ORIGIN.replace(/\/+$/, '')
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return origin + path
}
