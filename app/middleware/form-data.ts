import { formData, type FormDataOptions } from 'remix/middleware/form-data'
import type { Middleware } from 'remix/router'

/**
 * Wraps the standard `formData()` middleware so it does NOT eagerly parse
 * `multipart/form-data` bodies. URL-encoded bodies (login, password change,
 * invitations, etc.) are still parsed here as usual.
 *
 * Why: the upstream `formData()` middleware always rethrows multipart limit
 * errors regardless of `suppressErrors`, which means a slightly-too-large
 * upload bubbles up to the server entry point as a 500. The skill's
 * documented pattern is to "catch domain-specific upload errors at the
 * route boundary when they should become user-facing `Response` objects",
 * so the four upload-handling controllers (sticker upload, sticker edit,
 * avatar upload, API sticker create) call `readUploadFormData()`
 * themselves and turn errors into proper responses with inline form
 * messages or tagged JSON. See `app/utils/upload.ts`.
 *
 * Multipart-handling controllers must NOT call `context.get(FormData)` —
 * use `readUploadFormData(context.request)` instead. They also need to
 * call `assertCsrfToken(context, formData.get('_csrf'))` to validate the
 * synchronizer token, since the CSRF middleware also skips multipart
 * requests (it has no FormData to read from).
 */
export function formDataExceptUploads(
  options?: FormDataOptions,
): Middleware<{ key: typeof FormData; value: FormData; property: 'formData' }> {
  const inner = formData(options)
  return async (context, next) => {
    const contentType = context.request.headers.get('content-type') ?? ''
    if (contentType.startsWith('multipart/form-data')) {
      // Don't touch the body — upload controllers will parse it themselves
      // via `readUploadFormData()`. Anything that calls `get(FormData)` here
      // will get undefined at runtime; the type assertion below documents
      // the invariant that non-upload routes can read FormData freely.
      return next()
    }
    return inner(context, next)
  }
}
