import { createRouter, type MiddlewareContext } from 'remix/router'
import { compression } from 'remix/middleware/compression'
import { formData } from 'remix/middleware/form-data'
import { logger } from 'remix/middleware/logger'
import { staticFiles } from 'remix/middleware/static'

import rootController from './actions/controller.tsx'
import adminController from './actions/admin/controller.tsx'
import invitationsController from './actions/invitations/controller.tsx'
import invitationController from './actions/invitation/controller.tsx'
import loginController from './actions/login/controller.tsx'
import removeStickerController from './actions/remove-sticker/controller.tsx'
import uploadStickerController from './actions/upload-sticker/controller.tsx'
import { appSession, loadAuth } from './data/auth.ts'
import { loadDatabase } from './middleware/database.ts'
import { render } from './middleware/render.tsx'
import { routes } from './routes.ts'

const stack = [
  compression(),
  staticFiles('./public', { index: false }),
  formData(),
  appSession(),
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
router.map(routes.removeSticker, removeStickerController)
router.map(routes.uploadSticker, uploadStickerController)
