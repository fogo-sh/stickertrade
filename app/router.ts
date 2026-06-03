import { createRouter, type MiddlewareContext } from 'remix/router'
import { asyncContext } from 'remix/middleware/async-context'
import { compression } from 'remix/middleware/compression'
import { logger } from 'remix/middleware/logger'
import { staticFiles } from 'remix/middleware/static'

import rootController from './actions/controller.tsx'
import addSurfaceImageController from './actions/add-surface-image/controller.tsx'
import adminController from './actions/admin/controller.tsx'
import apiController from './actions/api/controller.tsx'
import changePasswordController from './actions/change-password/controller.tsx'
import editProfileController from './actions/edit-profile/controller.tsx'
import editStickerController from './actions/edit-sticker/controller.tsx'
import editSurfaceController from './actions/edit-surface/controller.tsx'
import invitationsController from './actions/invitations/controller.tsx'
import invitationController from './actions/invitation/controller.tsx'
import loginController from './actions/login/controller.tsx'
import removeStickerController from './actions/remove-sticker/controller.tsx'
import removeSurfaceController from './actions/remove-surface/controller.tsx'
import removeSurfaceImageController from './actions/remove-surface-image/controller.tsx'
import setPrimarySurfaceImageController from './actions/set-primary-surface-image/controller.tsx'
import uploadStickerController from './actions/upload-sticker/controller.tsx'
import uploadSurfaceController from './actions/upload-surface/controller.tsx'
import { appSession, loadAuth } from './data/auth.ts'
import { loadDatabase } from './middleware/database.ts'
import { formDataExceptUploads } from './middleware/form-data.ts'
import { csrfOrBearer } from './middleware/csrf-or-bearer.ts'
import { render } from './middleware/render.tsx'
import { routes } from './routes.ts'

/**
 * Comma-separated list of allowed public origins for CSRF Origin/Referer checks.
 * Required behind a TLS-terminating proxy where the browser's Origin header
 * doesn't match `context.url.origin` (which is whatever the proxy forwards to,
 * e.g. `http://stickertrade:44100`).
 *
 * Set `PUBLIC_ORIGIN=https://stickertrade.ca` in prod (multiple values
 * separated by commas if you also serve under www. etc.).
 */
function parsePublicOrigin(raw: string | undefined): string | string[] | undefined {
  if (!raw) return undefined
  const list = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
  if (list.length === 0) return undefined
  return list.length === 1 ? list[0] : list
}

const stack = [
  compression(),
  staticFiles('./public', { index: false }),
  // Parses application/x-www-form-urlencoded eagerly so simple forms
  // (login, password, invitations) can use `get(FormData)` directly.
  // Multipart bodies skip parsing here; upload-handling controllers parse
  // them via `readUploadFormData()` so they can render inline errors.
  formDataExceptUploads(),
  appSession(),
  csrfOrBearer({ origin: parsePublicOrigin(process.env.PUBLIC_ORIGIN) }),
  asyncContext(),
  loadDatabase(),
  loadAuth(),
  render(),
] as const

const devStack =
  process.env.NODE_ENV === 'development' ? [logger(), ...stack] : (stack as readonly unknown[])

type AppContext = MiddlewareContext<typeof stack>

declare module 'remix/router' {
  interface RouterTypes {
    context: AppContext
  }
}

export const router = createRouter<AppContext>({ middleware: devStack as unknown as any[] })

router.map(routes, rootController)
router.map(routes.admin, adminController)
router.map(routes.invitations, invitationsController)
router.map(routes.invitation, invitationController)
router.map(routes.login, loginController)
router.map(routes.changePassword, changePasswordController)
router.map(routes.editProfile, editProfileController)
router.map(routes.editSticker, editStickerController)
router.map(routes.editSurface, editSurfaceController)
router.map(routes.api, apiController)
router.map(routes.removeSticker, removeStickerController)
router.map(routes.removeSurface, removeSurfaceController)
router.map(routes.uploadSticker, uploadStickerController)
router.map(routes.uploadSurface, uploadSurfaceController)
router.map(routes.addSurfaceImage, addSurfaceImageController)
router.map(routes.removeSurfaceImage, removeSurfaceImageController)
router.map(routes.setPrimarySurfaceImage, setPrimarySurfaceImageController)
