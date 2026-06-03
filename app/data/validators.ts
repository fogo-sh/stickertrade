/**
 * Reusable form-data validation building blocks.
 *
 * The codebase validates every form input via `remix/data-schema` + the
 * `form-data` adapter; this module collects the shared sub-schemas
 * (username, password, sticker name, etc.) so the rules live in one place
 * and the same checks apply whether a field is submitted from the login
 * form, the change-password form, an invitation accept, or the
 * bootstrap-admin CLI.
 *
 * Controllers use these with `s.parseSafe(schema, formData)`. On failure
 * they convert the resulting `issues[]` to a flat `{ field: message }`
 * record via `issuesToFieldErrors` and re-render the page.
 */
import * as s from 'remix/data-schema'
import type { Issue } from 'remix/data-schema'

/**
 * String with surrounding whitespace trimmed, then bounded in length with
 * the supplied user-facing message.
 */
function boundedString(min: number, max: number, message: string) {
  return s
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length >= min && value.length <= max, message)
}

/** Usernames are 3-16 chars, [a-zA-Z0-9_-]. Same rules everywhere. */
export const usernameSchema = boundedString(3, 16, 'Username must be 3-16 characters').refine(
  (value) => /^[a-zA-Z0-9_-]+$/.test(value),
  'Username may only contain letters, numbers, underscores, and dashes',
)

/**
 * Passwords are 8-64 chars. Used for setting NEW passwords (signup,
 * change-password, bootstrap-admin). Login uses a looser schema since we
 * don't want to leak the policy by rejecting a too-short submitted
 * password — let bcrypt do its thing.
 */
export const newPasswordSchema = s
  .string()
  .refine((v) => v.length >= 8 && v.length <= 64, 'Password must be 8-64 characters')

/** Login submits any non-empty string; verification happens against bcrypt. */
export const loginPasswordSchema = s.string().refine((v) => v.length > 0, 'Password is required')

/** Sticker names are 1-60 chars after trimming. */
export const stickerNameSchema = boundedString(1, 60, 'Name must be 1-60 characters')

/** Token labels mirror sticker names: 1-60 chars after trimming. */
export const tokenNameSchema = boundedString(1, 60, 'Token name must be 1-60 characters')

/**
 * Flatten a `parseSafe` failure into a `{ fieldName: message }` record
 * keyed by the first path segment. Multiple issues on the same field
 * collapse to the first message — pages display one error per field, so
 * piling them up doesn't help.
 */
export function issuesToFieldErrors(
  issues: ReadonlyArray<Issue>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of issues) {
    const segments = issue.path
    let key = '_form'
    if (segments && segments.length > 0) {
      const first = segments[0] as PropertyKey | { key?: PropertyKey }
      key = String(
        typeof first === 'object' && first !== null && 'key' in first ? first.key : first,
      )
    }
    if (errors[key] == null) errors[key] = issue.message
  }
  return errors
}
