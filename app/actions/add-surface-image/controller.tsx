import { randomUUID } from 'node:crypto'

import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces, surfaceImages } from '../../data/schema.ts'
import {
  ProcessImageError,
  processSurfaceUpload,
} from '../../data/upload-image.ts'
import { routes } from '../../routes.ts'
import { readVerifiedUploadFormData } from '../../utils/upload.ts'

const MAX_GALLERY_FILES = 8

function notFound() {
  return new Response('Not Found', { status: 404 })
}

export default createController(routes.addSurfaceImage, {
  actions: {
    index(context) {
      // GET: not a real page; bounce back to the edit form.
      return redirect(
        routes.editSurface.index.href({ slug: context.params.slug }),
        303,
      )
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, {
        where: { slug: context.params.slug },
      })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      // Check current count BEFORE accepting the upload.
      const currentCount = await db.count(surfaceImages, {
        where: { surface_id: surface.id },
      })
      if (currentCount >= MAX_GALLERY_FILES) {
        return new Response(
          `Surface already has ${MAX_GALLERY_FILES} images`,
          { status: 400 },
        )
      }

      const verified = await readVerifiedUploadFormData(context, {
        maxFiles: 1,
        maxTotalSize: 10 * 1024 * 1024 + 1024,
      })
      if (!verified.success) {
        if (verified.kind === 'csrf') return verified.response
        return new Response(verified.error.message, {
          status: verified.error.status,
        })
      }
      const formData = verified.value

      const file = formData.get('image')
      if (!(file instanceof File) || file.size === 0) {
        return new Response('No image provided', { status: 400 })
      }

      let storedUrl: string
      try {
        storedUrl = await processSurfaceUpload(file)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Upload failed'
        const status =
          error instanceof ProcessImageError && error.code === 'file_too_large'
            ? 413
            : 400
        return new Response(message, { status })
      }

      await db.create(surfaceImages, {
        id: randomUUID(),
        surface_id: surface.id,
        image_url: storedUrl,
        is_primary: false,
        created_at: Date.now(),
      })

      return redirect(
        routes.editSurface.index.href({ slug: surface.slug }),
        303,
      )
    },
  },
})
