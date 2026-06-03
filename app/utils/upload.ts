/**
 * Boundary parsing for file-upload routes.
 *
 * The global `formData()` middleware unconditionally throws on multipart
 * limit errors. For file-upload routes (sticker upload, sticker edit,
 * avatar upload, API sticker create) we want the controller to translate
 * those into a user-facing `Response` instead — that's the "return a
 * `Response` for expected outcomes" pattern from the Remix skill.
 *
 * To do that, upload-handling controllers skip the global middleware and
 * call `readVerifiedUploadFormData(context)` here. That helper combines
 * three steps into one: parse the multipart body, translate any limit
 * error into a structured `UploadError`, and re-verify the `_csrf` field
 * (since the global CSRF middleware also skips multipart bodies).
 *
 * The success shape mirrors `parseSafe` from `remix/data-schema`. Failure
 * is a tagged union: `kind: 'upload'` carries the structured error info
 * for controllers to turn into either an inline-error page (HTML) or a
 * tagged JSON error (API), while `kind: 'csrf'` is already a `Response`
 * the controller can return as-is.
 */
import type { RequestContext } from 'remix/router'
import {
  MaxFilesExceededError,
  MaxFileSizeExceededError,
  MaxHeaderSizeExceededError,
  MaxPartsExceededError,
  MaxTotalSizeExceededError,
  MultipartParseError,
  parseFormData,
  type ParseFormDataOptions,
} from 'remix/form-data-parser'

import { assertCsrfToken } from './csrf.ts'

/** Single source of truth for upload limits, kept simple on purpose. */
export const UPLOAD_LIMITS = {
  /** Max bytes per file. */
  maxFileSize: 10 * 1024 * 1024,
  /** Total request body cap (a little headroom over one file plus text fields). */
  maxTotalSize: 11 * 1024 * 1024,
  /** No reason a single sticker form should accept more than this. */
  maxFiles: 4,
  /** Plenty for fields plus a file or two. */
  maxParts: 100,
} as const satisfies ParseFormDataOptions

/** Stable, machine-readable error codes. */
export type UploadErrorCode =
  | 'file_too_large'
  | 'total_size_too_large'
  | 'too_many_files'
  | 'too_many_parts'
  | 'header_too_large'
  | 'malformed_upload'

export interface UploadError {
  status: number
  code: UploadErrorCode
  message: string
  /** Extras returned alongside the code (e.g. `max_bytes`). */
  extras: Record<string, unknown>
}

export type UploadResult =
  | { success: true; value: FormData }
  | { success: false; error: UploadError }

function describeBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${Math.round(mb * 10) / 10} MiB`
  return `${Math.round(bytes / 1024)} KiB`
}

function toUploadError(error: unknown): UploadError | null {
  if (error instanceof MaxFileSizeExceededError) {
    return {
      status: 413,
      code: 'file_too_large',
      message: `image is too large; max ${describeBytes(UPLOAD_LIMITS.maxFileSize)} per file`,
      extras: { max_bytes: UPLOAD_LIMITS.maxFileSize },
    }
  }
  if (error instanceof MaxTotalSizeExceededError) {
    return {
      status: 413,
      code: 'total_size_too_large',
      message: `upload is too large overall; max ${describeBytes(UPLOAD_LIMITS.maxTotalSize)} per request`,
      extras: { max_bytes: UPLOAD_LIMITS.maxTotalSize },
    }
  }
  if (error instanceof MaxFilesExceededError) {
    return {
      status: 400,
      code: 'too_many_files',
      message: `too many files; max ${UPLOAD_LIMITS.maxFiles} per upload`,
      extras: { max_files: UPLOAD_LIMITS.maxFiles },
    }
  }
  if (error instanceof MaxPartsExceededError) {
    return {
      status: 400,
      code: 'too_many_parts',
      message: 'upload has too many fields',
      extras: {},
    }
  }
  if (error instanceof MaxHeaderSizeExceededError) {
    return {
      status: 400,
      code: 'header_too_large',
      message: 'upload contains an oversized header',
      extras: {},
    }
  }
  if (error instanceof MultipartParseError) {
    return {
      status: 400,
      code: 'malformed_upload',
      message: 'upload is malformed; please try again',
      extras: {},
    }
  }
  return null
}

/**
 * Parse a multipart upload at the route boundary, turning multipart limit
 * errors into a returned `UploadError` instead of a thrown exception. Any
 * non-multipart error is rethrown so it surfaces as a real 500 — that's a
 * bug to fix, not a user-facing condition.
 *
 * Prefer `readVerifiedUploadFormData` in controllers — it folds in the
 * CSRF check so callers can't forget either step.
 */
export async function readUploadFormData(request: Request): Promise<UploadResult> {
  try {
    const value = await parseFormData(request, UPLOAD_LIMITS)
    return { success: true, value }
  } catch (error) {
    const uploadError = toUploadError(error)
    if (uploadError) return { success: false, error: uploadError }
    throw error
  }
}

export type VerifiedUploadResult =
  | { success: true; value: FormData }
  | { success: false; kind: 'upload'; error: UploadError }
  | { success: false; kind: 'csrf'; response: Response }

/**
 * Parse the multipart body AND verify CSRF in one call. Controllers that
 * accept browser uploads should reach for this — it eliminates the
 * footgun of remembering to call both `readUploadFormData` and
 * `assertCsrfToken`. API-only routes (which skip CSRF entirely) can
 * still use `readUploadFormData` directly.
 */
export async function readVerifiedUploadFormData(
  context: RequestContext<any, any>,
): Promise<VerifiedUploadResult> {
  const parsed = await readUploadFormData(context.request)
  if (!parsed.success) {
    return { success: false, kind: 'upload', error: parsed.error }
  }
  const denied = assertCsrfToken(context, parsed.value.get('_csrf'))
  if (denied) {
    return { success: false, kind: 'csrf', response: denied }
  }
  return { success: true, value: parsed.value }
}
