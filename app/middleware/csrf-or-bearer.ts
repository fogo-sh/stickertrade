import { csrf, type CsrfOptions } from 'remix/middleware/csrf'
import type { Middleware } from 'remix/router'

/**
 * Wraps the standard CSRF middleware so it short-circuits cleanly for
 * requests that handle their own auth/CSRF posture:
 *
 *  - `/api/*` routes: clients send `Authorization: Bearer ...`, not session
 *    cookies, so the synchronizer-token model doesn't apply. Auth failures
 *    return 401 from the controller rather than a 403 from CSRF.
 *  - Requests with an `Authorization: Bearer` header anywhere on the site
 *    (rare, but possible) similarly skip CSRF.
 *  - `multipart/form-data` requests: the controller parses the body itself
 *    via `readUploadFormData()` because the global form-data middleware
 *    isn't allowed to consume it (it would throw on multipart limit errors
 *    before the controller could render a friendly response). The
 *    controller then re-verifies the `_csrf` field against the session
 *    token using `assertCsrfToken()` from `app/utils/csrf.ts`.
 *
 * Everything else (the normal HTML form path) goes through the standard
 * middleware unchanged.
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
    const contentType = context.request.headers.get('content-type') ?? ''
    if (contentType.startsWith('multipart/form-data')) {
      return next()
    }
    return csrfMiddleware(context, next)
  }
}
