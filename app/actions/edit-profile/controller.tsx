import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { listTokensForUser } from '../../data/api-tokens.ts'
import { getCurrentUser } from '../../data/current-user.ts'
import { users } from '../../data/schema.ts'
import { processAvatarUpload } from '../../data/upload-image.ts'
import { uploadStorage } from '../../data/uploads.ts'
import { routes } from '../../routes.ts'
import { readVerifiedUploadFormData } from '../../utils/upload.ts'
import { EditProfilePage } from '../edit-profile-page.tsx'

async function safeRemoveStoredUpload(url: string | null) {
  if (!url || !url.startsWith('/uploads/')) return
  const key = url.slice('/uploads/'.length)
  try {
    await uploadStorage.remove(key)
  } catch {
    // ignore
  }
}

export default createController(routes.editProfile, {
  actions: {
    async index(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)
      const session = context.get(Session)
      const avatarFlash = session.get('profile_flash') as string | undefined
      session.unset('profile_flash')
      const passwordFlash = session.get('password_flash') as string | undefined
      session.unset('password_flash')
      const tokenFlash = session.get('token_flash') as string | undefined
      session.unset('token_flash')
      const tokenErrorName = session.get('token_error_name') as string | undefined
      session.unset('token_error_name')
      const tokenNewRaw = session.get('token_new') as string | undefined
      session.unset('token_new')

      const db = context.get(Database)
      const tokens = (await listTokensForUser(db, user.id)).map((t) => ({
        id: t.id,
        name: t.name,
        prefix: t.prefix,
        created_at: t.created_at,
        last_used_at: t.last_used_at ?? null,
      }))

      let newToken: { name: string; plaintext: string } | undefined
      if (tokenNewRaw) {
        try {
          newToken = JSON.parse(tokenNewRaw)
        } catch {
          // ignore malformed flash
        }
      }

      return context.render(
        <EditProfilePage
          user={user}
          avatarFlash={avatarFlash}
          passwordFlash={passwordFlash}
          tokens={tokens}
          tokenFlash={tokenFlash}
          tokenErrors={tokenErrorName ? { name: tokenErrorName } : undefined}
          newToken={newToken}
        />,
      )
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)

      // Two flows hit this action: the multipart avatar upload form and the
      // url-encoded "remove avatar" button. The global form-data middleware
      // parses the url-encoded body for us; the multipart body we parse
      // ourselves so we can render proper upload-too-large errors inline.
      const contentType = context.request.headers.get('content-type') ?? ''
      const isMultipart = contentType.startsWith('multipart/form-data')

      let formData: FormData
      if (isMultipart) {
        const parsed = await readVerifiedUploadFormData(context)
        if (!parsed.success) {
          if (parsed.kind === 'csrf') return parsed.response
          return context.render(
            <EditProfilePage user={user} avatarErrors={{ avatar: parsed.error.message }} />,
            { status: parsed.error.status },
          )
        }
        formData = parsed.value
      } else {
        formData = context.get(FormData)
      }

      const intent = String(formData.get('action') ?? '')

      // Read the row fresh so we delete the correct previous file (the
      // session-loaded identity could be stale after a recent upload).
      const fresh = await db.findOne(users, { where: { id: user.id } })
      const previousAvatarUrl = fresh?.avatar_url ?? null

      // Remove avatar branch
      if (intent === 'remove-avatar') {
        await safeRemoveStoredUpload(previousAvatarUrl)
        // Schema types avatar_url as `string | undefined`; we want to clear the column to NULL.
        await db.update(users, user.id, {
          avatar_url: null as unknown as undefined,
          updated_at: Date.now(),
        })
        const session = context.get(Session)
        session.flash('profile_flash', 'Avatar removed.')
        return redirect(routes.editProfile.index.href(), 303)
      }

      // Upload avatar branch
      const file = formData.get('avatar')
      if (!(file instanceof File) || file.size === 0) {
        return context.render(
          <EditProfilePage user={user} avatarErrors={{ avatar: 'Please choose an image' }} />,
          { status: 400 },
        )
      }

      let storedUrl: string
      try {
        storedUrl = await processAvatarUpload(file)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed'
        return context.render(
          <EditProfilePage user={user} avatarErrors={{ avatar: message }} />,
          { status: 400 },
        )
      }

      // Best-effort cleanup of the previous avatar file (read fresh above).
      await safeRemoveStoredUpload(previousAvatarUrl)

      await db.update(users, user.id, { avatar_url: storedUrl, updated_at: Date.now() })
      const session = context.get(Session)
      session.flash('profile_flash', 'Avatar updated.')
      return redirect(routes.editProfile.index.href(), 303)
    },
  },
})
