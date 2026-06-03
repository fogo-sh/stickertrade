import { randomUUID } from 'node:crypto'

import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces } from '../../data/schema.ts'
import { generateContentSlug } from '../../data/slug.ts'
import { processSurfaceUpload } from '../../data/upload-image.ts'
import {
  issuesToFieldErrors,
  surfaceDescriptionSchema,
  surfaceNameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { readVerifiedUploadFormData } from '../../utils/upload.ts'
import { UploadSurfacePage } from '../upload-surface-page.tsx'

const fileRequired = s
  .instanceof_(File)
  .refine((file) => file.size > 0, 'Please choose an image')

const uploadSurfaceSchema = f.object({
  name: f.field(surfaceNameSchema),
  description: f.field(s.optional(surfaceDescriptionSchema)),
  image: f.file(fileRequired),
})

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

      const verified = await readVerifiedUploadFormData(context)
      if (!verified.success) {
        if (verified.kind === 'csrf') return verified.response
        return context.render(
          <UploadSurfacePage user={user} errors={{ image: verified.error.message }} />,
          { status: verified.error.status },
        )
      }
      const formData = verified.value

      const parsed = s.parseSafe(uploadSurfaceSchema, formData)
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

      const { name, description, image } = parsed.value

      let storedImageUrl: string
      try {
        storedImageUrl = await processSurfaceUpload(image)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed'
        return context.render(
          <UploadSurfacePage
            user={user}
            errors={{ image: message }}
            values={{ name, description: description ?? '' }}
          />,
          { status: 400 },
        )
      }

      const db = context.get(Database)
      const now = Date.now()
      const id = randomUUID()
      const slug = generateContentSlug(name)
      await db.create(surfaces, {
        id,
        name,
        slug,
        ...(description == null ? {} : { description }),
        image_url: storedImageUrl,
        owner_id: user.id,
        created_at: now,
        updated_at: now,
      })

      return redirect(`/surface/${encodeURIComponent(slug)}`, 303)
    },
  },
})
