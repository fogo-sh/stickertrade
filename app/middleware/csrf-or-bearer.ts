import { csrf, type CsrfOptions } from 'remix/middleware/csrf'
import type { Middleware } from 'remix/router'

/**
 * Wraps the standard CSRF middleware so that requests to the JSON API surface
 * (`/api/*`) and requests carrying an `Authorization: Bearer ...` header skip
 * CSRF entirely. API clients authenticate with bearer tokens (not session
 * cookies), so the synchronizer token model doesn't apply to them — and they
 * have no way to read a token anyway. Auth failures inside the API return
 * 401 (handled by the controller), not a CSRF 403.
 *
 * Inside the browser, session-cookie auth + form posts go through CSRF as
 * usual.
 */
export function csrfOrBearer(options?: CsrfOptions): Middleware {
  const csrfMiddleware = csrf(options)
  return async (context, next) => {
    const url = new URL(context.request.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return next()
    }
    const authHeader = context.request.headers.get('authorization') ?? ''
    if (/^Bearer\s+\S+/i.test(authHeader)) {
      return next()
    }
    return csrfMiddleware(context, next)
  }
}
