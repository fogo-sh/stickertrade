import { randomUUID } from 'node:crypto'

import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces, surfaceImages } from '../../data/schema.ts'
import { generateContentSlug } from '../../data/slug.ts'
import {
  ProcessImageError,
  processSurfaceUpload,
} from '../../data/upload-image.ts'
import { uploadStorage } from '../../data/uploads.ts'
import {
  issuesToFieldErrors,
  surfaceDescriptionSchema,
  surfaceNameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { readVerifiedUploadFormData } from '../../utils/upload.ts'
import { UploadSurfacePage } from '../upload-surface-page.tsx'

const MAX_GALLERY_FILES = 8
const MAX_TOTAL_BYTES = 88 * 1024 * 1024 // 8 × 10 MiB + headroom

async function cleanupStoredUrls(urls: string[]): Promise<void> {
  for (const url of urls) {
    if (!url || !url.startsWith('/uploads/')) continue
    const key = url.slice('/uploads/'.length)
    try {
      await uploadStorage.remove(key)
    } catch {
      // ignore
    }
  }
}

export default createController(routes.uploadSurface, {
  actions: {
    index(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)
      return context.render(<UploadSurfacePage user={user} />)
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const verified = await readVerifiedUploadFormData(context, {
        maxFiles: MAX_GALLERY_FILES,
        maxTotalSize: MAX_TOTAL_BYTES,
      })
      if (!verified.success) {
        if (verified.kind === 'csrf') return verified.response
        return context.render(
          <UploadSurfacePage user={user} errors={{ image: verified.error.message }} />,
          { status: verified.error.status },
        )
      }
      const formData = verified.value

      // Validate name + description via schemas.
      const nameAndDescSchema = f.object({
        name: f.field(surfaceNameSchema),
        description: f.field(s.optional(surfaceDescriptionSchema)),
      })
      const parsed = s.parseSafe(nameAndDescSchema, formData)
      if (!parsed.success) {
        return context.render(
          <UploadSurfacePage
            user={user}
            errors={issuesToFieldErrors(parsed.issues)}
            values={{
              name: String(formData.get('name') ?? ''),
              description: String(formData.get('description') ?? ''),
            }}
          />,
          { status: 400 },
        )
      }
      const { name, description } = parsed.value

      // Pull all File parts named "image" with non-zero size.
      const allImageFields = formData.getAll('image')
      const files = allImageFields.filter(
        (v): v is File => v instanceof File && v.size > 0,
      )

      if (files.length === 0) {
        return context.render(
          <UploadSurfacePage
            user={user}
            errors={{ image: 'please choose at least one image' }}
            values={{ name, description: description ?? '' }}
          />,
          { status: 400 },
        )
      }
      if (files.length > MAX_GALLERY_FILES) {
        return context.render(
          <UploadSurfacePage
            user={user}
            errors={{ image: `at most ${MAX_GALLERY_FILES} images per surface` }}
            values={{ name, description: description ?? '' }}
          />,
          { status: 400 },
        )
      }

      // Process each file. On any failure, clean up stored URLs and re-render.
      const storedUrls: string[] = []
      for (const file of files) {
        try {
          const url = await processSurfaceUpload(file)
          storedUrls.push(url)
        } catch (error) {
          await cleanupStoredUrls(storedUrls)
          let message = 'upload failed'
          if (error instanceof ProcessImageError) message = error.message
          else if (error instanceof Error) message = error.message
          return context.render(
            <UploadSurfacePage
              user={user}
              errors={{ image: message }}
              values={{ name, description: description ?? '' }}
            />,
            { status: 400 },
          )
        }
      }

      // Insert surface + images atomically.
      const db = context.get(Database)
      const now = Date.now()
      const surfaceId = randomUUID()
      const slug = generateContentSlug(name)

      try {
        await db.transaction(async (tx) => {
          await tx.create(surfaces, {
            id: surfaceId,
            name,
            slug,
            ...(description == null ? {} : { description }),
            owner_id: user.id,
            created_at: now,
            updated_at: now,
          })
          for (let i = 0; i < storedUrls.length; i++) {
            await tx.create(surfaceImages, {
              id: randomUUID(),
              surface_id: surfaceId,
              image_url: storedUrls[i]!,
              is_primary: i === 0,
              created_at: now + i, // preserve upload order in created_at
            })
          }
        })
      } catch (error) {
        // Catastrophic: clean up storage so we don't leak files.
        await cleanupStoredUrls(storedUrls)
        throw error
      }

      return redirect(`/surface/${encodeURIComponent(slug)}`, 303)
    },
  },
})
