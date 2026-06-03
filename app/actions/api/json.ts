/**
 * JSON response helpers for the /api/* surface.
 *
 * Three response shapes for errors:
 *
 *   // simple message error
 *   jsonError(404, 'Not Found')
 *   // -> { "error": "Not Found" }
 *
 *   // validation failure with structured issues
 *   jsonError(400, 'Validation failed', { issues: [...] })
 *   // -> { "error": "Validation failed", "issues": [...] }
 *
 *   // tagged error with a human message + extra context
 *   jsonError(413, 'file_too_large', { message: 'image is too large...', max_bytes: 10485760 })
 *   // -> { "error": "file_too_large", "message": "image is too large...", "max_bytes": 10485760 }
 *
 * The third shape is what the rest of the codebase calls a "tagged" error:
 * the `error` field is a stable code like `file_too_large`, and the
 * `message` field carries the human-friendly description. API clients can
 * branch on `error` to display the right UI without parsing the message.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

export function jsonOk(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  })
}

export interface JsonErrorOptions {
  /** Human-friendly message. Shown alongside the error code. */
  message?: string
  /** Structured validation issues, e.g. from a schema parse failure. */
  issues?: unknown
  /** Extra fields merged into the body for context (e.g. `max_bytes`). */
  [key: string]: unknown
}

export function jsonError(
  status: number,
  error: string,
  options: JsonErrorOptions = {},
): Response {
  const { message, issues, ...extras } = options
  const body: Record<string, unknown> = { error, ...extras }
  if (message != null) body.message = message
  if (issues != null) body.issues = issues
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  })
}
