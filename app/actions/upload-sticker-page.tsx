import { css } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { CsrfField, FileField, SubmitButton, TextField, errorStyle } from '../ui/form.tsx'

export interface UploadStickerPageProps {
  user: HeaderUser | null
  errors?: Record<string, string>
  values?: { name?: string }
}

export function UploadStickerPage() {
  return ({ user, errors = {}, values = {} }: UploadStickerPageProps) => (
    <Document title="stickertrade - upload sticker" user={user}>
      <main mix={css({ maxWidth: '32rem', margin: '0 auto' })}>
        <h1 mix={css({ fontSize: '1.5rem', marginBottom: '1rem' })}>upload sticker</h1>
        <form
          method="post"
          action={routes.uploadSticker.action.href()}
          encType="multipart/form-data"
        >
          <CsrfField />
          <TextField name="name" label="name" value={values.name} error={errors.name} />
          <FileField name="image" label="image" error={errors.image} />
          {errors._form ? <p mix={errorStyle}>{errors._form}</p> : null}
          <SubmitButton label="create sticker" />
        </form>
        <p mix={linkRowStyle}>
          have a bunch?{' '}
          <a href={routes.batchUploadStickers.href()}>try batch upload →</a>
        </p>
      </main>
    </Document>
  )
}

const linkRowStyle = css({
  marginTop: '1.5rem',
  fontSize: '0.875rem',
  opacity: 0.85,
})
