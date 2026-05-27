import { randomUUID } from 'node:crypto'

import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { stickers } from '../../data/schema.ts'
import { processStickerUpload } from '../../data/upload-image.ts'
import { routes } from '../../routes.ts'
import { UploadStickerPage } from '../upload-sticker-page.tsx'

export default createController(routes.uploadSticker, {
  actions: {
    index(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)
      return context.render(<UploadStickerPage user={user} />)
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const formData = context.get(FormData)
      const name = String(formData.get('name') ?? '').trim()
      const file = formData.get('image')

      const errors: Record<string, string> = {}
      if (name.length === 0 || name.length > 60) {
        errors.name = 'Name must be 1-60 characters'
      }
      if (!(file instanceof File) || file.size === 0) {
        errors.image = 'Please choose an image'
      }

      if (Object.keys(errors).length > 0) {
        return context.render(
          <UploadStickerPage user={user} errors={errors} values={{ name }} />,
          { status: 400 },
        )
      }

      let storedImageUrl: string
      try {
        storedImageUrl = await processStickerUpload(file as File)
      } catch (error) {
        return context.render(
          <UploadStickerPage
            user={user}
            errors={{ image: error instanceof Error ? error.message : 'Upload failed' }}
            values={{ name }}
          />,
          { status: 400 },
        )
      }

      const db = context.get(Database)
      const now = Date.now()
      const id = randomUUID()
      await db.create(stickers, {
        id,
        name,
        image_url: storedImageUrl,
        owner_id: user.id,
        created_at: now,
        updated_at: now,
      })

      return redirect(routes.sticker.href({ id }), 303)
    },
  },
})
