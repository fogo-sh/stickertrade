import { randomUUID } from 'node:crypto'

import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { stickers } from '../../data/schema.ts'
import { generateStickerSlug } from '../../data/slug.ts'
import { processStickerUpload } from '../../data/upload-image.ts'
import {
  issuesToFieldErrors,
  stickerNameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { readVerifiedUploadFormData } from '../../utils/upload.ts'
import { UploadStickerPage } from '../upload-sticker-page.tsx'

const fileRequired = s
  .instanceof_(File)
  .refine((file) => file.size > 0, 'Please choose an image')

const uploadStickerSchema = f.object({
  name: f.field(stickerNameSchema),
  image: f.file(fileRequired),
})

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

      const verified = await readVerifiedUploadFormData(context)
      if (!verified.success) {
        if (verified.kind === 'csrf') return verified.response
        return context.render(
          <UploadStickerPage user={user} errors={{ image: verified.error.message }} />,
          { status: verified.error.status },
        )
      }
      const formData = verified.value

      const parsed = s.parseSafe(uploadStickerSchema, formData)
      if (!parsed.success) {
        return context.render(
          <UploadStickerPage
            user={user}
            errors={issuesToFieldErrors(parsed.issues)}
            values={{ name: String(formData.get('name') ?? '') }}
          />,
          { status: 400 },
        )
      }

      const { name, image } = parsed.value

      let storedImageUrl: string
      try {
        storedImageUrl = await processStickerUpload(image)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed'
        return context.render(
          <UploadStickerPage user={user} errors={{ image: message }} values={{ name }} />,
          { status: 400 },
        )
      }

      const db = context.get(Database)
      const now = Date.now()
      const id = randomUUID()
      const slug = generateStickerSlug(name)
      await db.create(stickers, {
        id,
        name,
        slug,
        image_url: storedImageUrl,
        owner_id: user.id,
        created_at: now,
        updated_at: now,
      })

      return redirect(`/sticker/${encodeURIComponent(slug)}`, 303)
    },
  },
})
