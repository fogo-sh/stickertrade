import { randomBytes } from 'node:crypto'

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const SUFFIX_LENGTH = 6
const SLUG_PART_MAX = 40

/**
 * Reduce a sticker name to a URL-safe slug fragment.
 *
 * - Lowercases.
 * - Replaces any run of non-`[a-z0-9]` chars with a single hyphen.
 * - Trims leading/trailing hyphens.
 * - Hard-caps at 40 chars (trimming any trailing hyphen left by the cut).
 *
 * Returns an empty string if the name slugifies to nothing (emoji-only
 * names, whitespace-only names, etc.). Callers should append a suffix.
 */
export function slugifyName(name: string): string {
  const lowered = name.toLowerCase()
  const replaced = lowered.replace(/[^a-z0-9]+/g, '-')
  const trimmed = replaced.replace(/^-+|-+$/g, '')
  if (trimmed.length <= SLUG_PART_MAX) return trimmed
  return trimmed.slice(0, SLUG_PART_MAX).replace(/-+$/g, '')
}

/**
 * Build a full content slug: `<slug-part>-<6 lowercase alphanumerics>`.
 * If `slugifyName(name)` is empty, returns just the 6-char suffix.
 *
 * Used by both stickers and surfaces (and any future named content type)
 * since the alphabet, suffix length, and 40-char cap are universal.
 */
export function generateContentSlug(name: string): string {
  const slugPart = slugifyName(name)
  const suffix = randomSuffix()
  return slugPart === '' ? suffix : `${slugPart}-${suffix}`
}

/**
 * True if the input string looks like a v4-ish UUID (8-4-4-4-12 lowercase
 * hex). Used by the sticker show/edit handlers to detect old UUID URLs
 * and 301-redirect them to the slug URL.
 */
export function looksLikeUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function randomSuffix(): string {
  // randomBytes(SUFFIX_LENGTH) gives us SUFFIX_LENGTH bytes of entropy;
  // we use each byte mod 36 to pick from the alphabet. The tiny bias
  // (256 % 36 = 4 extra picks for the first 4 chars) does not matter
  // for our use case.
  const bytes = randomBytes(SUFFIX_LENGTH)
  let out = ''
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    out += SUFFIX_ALPHABET[bytes[i]! % SUFFIX_ALPHABET.length]
  }
  return out
}
