import { css, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import {
  CsrfField,
  FileField,
  SubmitButton,
  TextField,
  errorStyle,
  fieldStyle,
  inputStyle,
} from '../ui/form.tsx'

export interface UploadSurfacePageProps {
  user: HeaderUser | null
  errors?: Record<string, string>
  values?: { name?: string; description?: string }
}

const textareaExtraStyle = css({
  minHeight: '8rem',
  resize: 'vertical',
  fontFamily: 'inherit',
})

export function UploadSurfacePage(handle: Handle<UploadSurfacePageProps>) {
  return () => {
    const { user, errors = {}, values = {} } = handle.props
    return (
    <Document title="stickertrade - upload surface" user={user}>
      <main mix={css({ maxWidth: '32rem', margin: '0 auto' })}>
        <h1 mix={css({ fontSize: '1.5rem', marginBottom: '1rem' })}>upload surface</h1>
        <form
          method="post"
          action={routes.uploadSurface.action.href()}
          encType="multipart/form-data"
        >
          <CsrfField />
          <TextField name="name" label="name" value={values.name} error={errors.name} />
          <label mix={fieldStyle}>
            <span mix={css({ display: 'block', marginBottom: '0.25rem' })}>
              description (optional)
            </span>
            <textarea
              name="description"
              defaultValue={values.description ?? ''}
              maxLength={500}
              mix={[inputStyle, textareaExtraStyle]}
            />
            {errors.description ? <p mix={errorStyle}>{errors.description}</p> : null}
          </label>
          <FileField
            name="image"
            label="images"
            helperText="up to 8 images. the first will be the primary."
            accept="image/png,image/jpeg,image/webp"
            required
            multiple
            error={errors.image}
          />
          {errors._form ? <p mix={errorStyle}>{errors._form}</p> : null}
          <SubmitButton label="create surface" />
        </form>
      </main>
    </Document>
    )
  }
}
