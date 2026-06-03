import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { stickers } from '../../data/schema.ts'
import { looksLikeUuid } from '../../data/slug.ts'
import { processStickerUpload } from '../../data/upload-image.ts'
import { uploadStorage } from '../../data/uploads.ts'
import {
  issuesToFieldErrors,
  stickerNameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { readVerifiedUploadFormData } from '../../utils/upload.ts'
import { EditStickerPage } from '../edit-sticker-page.tsx'

// On the edit page the image field is optional — submitting without a file
// keeps the existing image. We map any zero-byte File or absent field to
// `undefined` so the action can branch on its presence cleanly.
const optionalImage = s
  .optional(s.instanceof_(File))
  .transform((value) => (value && value.size > 0 ? value : undefined))

const editStickerSchema = f.object({
  name: f.field(stickerNameSchema),
  image: f.file(optionalImage),
})

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
      const param = context.params.slug
      if (looksLikeUuid(param)) {
        const byId = await db.findOne(stickers, { where: { id: param } })
        if (!byId) return notFound()
        return redirect(routes.editSticker.index.href({ slug: byId.slug }), 301)
      }
      const sticker = await db.findOne(stickers, { where: { slug: param } })
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
          sticker={{
            id: sticker.id,
            slug: sticker.slug,
            name: sticker.name,
            image_url: sticker.image_url,
          }}
          flash={flash}
        />,
      )
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      // POST: look up by slug only. A POST to /sticker/<uuid>/edit is a
      // stale form submission -- return 404 so the user re-navigates.
      const sticker = await db.findOne(stickers, { where: { slug: context.params.slug } })
      if (!sticker) return notFound()
      if (sticker.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      // Two flows hit this action: a multipart submit with a new image,
      // or a url-encoded submit that only changes the name. The global
      // form-data middleware parses the url-encoded body for us; we parse
      // the multipart body here so upload-too-large errors render inline.
      const contentType = context.request.headers.get('content-type') ?? ''
      const isMultipart = contentType.startsWith('multipart/form-data')

      let formData: FormData
      if (isMultipart) {
        const verified = await readVerifiedUploadFormData(context)
        if (!verified.success) {
          if (verified.kind === 'csrf') return verified.response
          return context.render(
            <EditStickerPage
              user={user}
              sticker={{
                id: sticker.id,
                slug: sticker.slug,
                name: sticker.name,
                image_url: sticker.image_url,
              }}
              errors={{ image: verified.error.message }}
            />,
            { status: verified.error.status },
          )
        }
        formData = verified.value
      } else {
        formData = context.get(FormData)
      }

      const parsed = s.parseSafe(editStickerSchema, formData)
      if (!parsed.success) {
        const errors = issuesToFieldErrors(parsed.issues)
        return context.render(
          <EditStickerPage
            user={user}
            sticker={{
              id: sticker.id,
              slug: sticker.slug,
              name: String(formData.get('name') ?? ''),
              image_url: sticker.image_url,
            }}
            errors={errors}
          />,
          { status: 400 },
        )
      }

      const { name, image } = parsed.value
      const changes: Partial<{ name: string; image_url: string; updated_at: number }> = {
        name,
        updated_at: Date.now(),
      }

      if (image) {
        let storedUrl: string
        try {
          storedUrl = await processStickerUpload(image)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed'
          return context.render(
            <EditStickerPage
              user={user}
              sticker={{
                id: sticker.id,
                slug: sticker.slug,
                name,
                image_url: sticker.image_url,
              }}
              errors={{ image: message }}
            />,
            { status: 400 },
          )
        }
        changes.image_url = storedUrl
      }

      await db.update(stickers, sticker.id, changes)

      // After the row is updated, clean up the previous file if it was replaced.
      if (image) {
        await safeRemoveStoredUpload(sticker.image_url)
      }

      const session = context.get(Session)
      session.flash('sticker_flash', 'Sticker updated.')
      return redirect(routes.sticker.href({ slug: sticker.slug }), 303)
    },
  },
})
