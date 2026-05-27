import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { stickers } from '../../data/schema.ts'
import { processStickerUpload } from '../../data/upload-image.ts'
import { uploadStorage } from '../../data/uploads.ts'
import { routes } from '../../routes.ts'
import { EditStickerPage } from '../edit-sticker-page.tsx'

function notFound() {
  return new Response('Not Found', { status: 404 })
}

async function safeRemoveStoredUpload(url: string | null | undefined) {
  if (!url || !url.startsWith('/uploads/')) return
  const key = url.slice('/uploads/'.length)
  try {
    await uploadStorage.remove(key)
  } catch {
    // ignore
  }
}

export default createController(routes.editSticker, {
  actions: {
    async index(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const sticker = await db.findOne(stickers, { where: { id: context.params.id } })
      if (!sticker) return notFound()
      if (sticker.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const session = context.get(Session)
      const flash = session.get('sticker_flash') as string | undefined
      session.unset('sticker_flash')

      return context.render(
        <EditStickerPage
          user={user}
          sticker={{ id: sticker.id, name: sticker.name, image_url: sticker.image_url }}
          flash={flash}
        />,
      )
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const sticker = await db.findOne(stickers, { where: { id: context.params.id } })
      if (!sticker) return notFound()
      if (sticker.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const formData = context.get(FormData)
      const name = String(formData.get('name') ?? '').trim()
      const file = formData.get('image')
      const hasNewImage = file instanceof File && file.size > 0

      const errors: Record<string, string> = {}
      if (name.length === 0 || name.length > 60) {
        errors.name = 'Name must be 1-60 characters'
      }

      if (Object.keys(errors).length > 0) {
        return context.render(
          <EditStickerPage
            user={user}
            sticker={{
              id: sticker.id,
              name,
              image_url: sticker.image_url,
            }}
            errors={errors}
          />,
          { status: 400 },
        )
      }

      const changes: Partial<{ name: string; image_url: string; updated_at: number }> = {
        name,
        updated_at: Date.now(),
      }

      if (hasNewImage) {
        let storedUrl: string
        try {
          storedUrl = await processStickerUpload(file as File)
        } catch (error) {
          return context.render(
            <EditStickerPage
              user={user}
              sticker={{ id: sticker.id, name, image_url: sticker.image_url }}
              errors={{ image: error instanceof Error ? error.message : 'Upload failed' }}
            />,
            { status: 400 },
          )
        }
        changes.image_url = storedUrl
      }

      await db.update(stickers, sticker.id, changes)

      // After the row is updated, clean up the previous file if it was replaced.
      if (hasNewImage) {
        await safeRemoveStoredUpload(sticker.image_url)
      }

      const session = context.get(Session)
      session.flash('sticker_flash', 'Sticker updated.')
      return redirect(routes.sticker.href({ id: sticker.id }), 303)
    },
  },
})
