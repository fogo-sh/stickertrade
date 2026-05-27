/**
 * JSON response helpers for the /api/* surface.
 *
 * Keeps response construction terse and consistent across controllers:
 *   return jsonOk({ sticker: ... })
 *   return jsonError(404, 'Not Found')
 */

export interface ApiErrorBody {
  error: string
  issues?: unknown
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

export function jsonOk(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  })
}

export function jsonError(status: number, error: string, issues?: unknown): Response {
  const body: ApiErrorBody = issues ? { error, issues } : { error }
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  })
}
