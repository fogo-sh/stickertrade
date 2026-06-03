/**
 * CSRF token check at the controller boundary.
 *
 * Used by upload-handling controllers whose multipart bodies are parsed by
 * the controller itself instead of the global `formData()` middleware (see
 * `app/utils/upload.ts`). The global CSRF middleware also skips multipart
 * requests for the same reason, so each upload controller calls this after
 * it parses its own `FormData`.
 */
import type { RequestContext } from 'remix/router'
import { getCsrfToken } from 'remix/middleware/csrf'

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Returns `null` when the submitted token matches the session-bound token,
 * or a 403 `Response` when it doesn't. Controllers use the return value
 * directly:
 *
 *   const denied = assertCsrfToken(context, formData.get('_csrf'))
 *   if (denied) return denied
 */
export function assertCsrfToken(
  context: RequestContext<any, any>,
  submitted: FormDataEntryValue | null,
): Response | null {
  const expected = getCsrfToken(context)
  const provided = typeof submitted === 'string' ? submitted.trim() : ''
  if (provided === '' || !constantTimeEqual(provided, expected)) {
    return new Response('Forbidden: invalid CSRF token', { status: 403 })
  }
  return null
}
