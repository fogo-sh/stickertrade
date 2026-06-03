import { css } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import {
  CsrfField,
  FileField,
  SubmitButton,
  TextField,
  errorStyle,
  fieldStyle,
  flashStyle,
  inputStyle,
} from '../ui/form.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { colors } from '../ui/theme.ts'

export interface EditSurfacePageProps {
  user: HeaderUser
  surface: {
    id: string
    slug: string
    name: string
    description: string | null
    image_url: string
  }
  errors?: Record<string, string>
  flash?: string
}

const textareaExtraStyle = css({
  minHeight: '8rem',
  resize: 'vertical',
  fontFamily: 'inherit',
})

export function EditSurfacePage() {
  return ({ user, surface, errors = {}, flash }: EditSurfacePageProps) => (
    <Document title={`stickertrade - edit ${surface.name}`} user={user}>
      <main mix={css({ maxWidth: '32rem', margin: '0 auto' })}>
        <h1 mix={css({ fontSize: '1.5rem', marginBottom: '1rem' })}>edit surface</h1>
        {flash ? <p mix={flashStyle}>{flash}</p> : null}

        <section mix={css({ marginBottom: '1.5rem' })}>
          <p mix={css({ fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.7 })}>
            current image
          </p>
          <img src={surface.image_url} alt={surface.name} mix={previewStyle} />
        </section>

        <form
          method="post"
          action={routes.editSurface.action.href({ slug: surface.slug })}
          encType="multipart/form-data"
        >
          <CsrfField />
          <TextField name="name" label="name" value={surface.name} error={errors.name} />
          <label mix={fieldStyle}>
            <span mix={css({ display: 'block', marginBottom: '0.25rem' })}>
              description (optional)
            </span>
            <textarea
              name="description"
              defaultValue={surface.description ?? ''}
              maxLength={500}
              mix={[inputStyle, textareaExtraStyle]}
            />
            {errors.description ? <p mix={errorStyle}>{errors.description}</p> : null}
          </label>
          <FileField name="image" label="replace image (optional)" error={errors.image} />
          <p mix={css({ fontSize: '0.85rem', opacity: 0.7, marginBottom: '0.75rem' })}>
            png or jpeg, max 10 MB. leave empty to keep the current image.
          </p>
          {errors._form ? <p mix={errorStyle}>{errors._form}</p> : null}
          <div mix={css({ display: 'flex', gap: '0.5rem', alignItems: 'center' })}>
            <SubmitButton label="save changes" />
            <a href={routes.surface.href({ slug: surface.slug })} mix={cancelLinkStyle}>
              cancel
            </a>
          </div>
        </form>
      </main>
    </Document>
  )
}

const previewStyle = css({
  maxWidth: '100%',
  border: `2px solid ${colors.light[500]}40`,
  background: '#000',
})

const cancelLinkStyle = css({
  marginTop: '0.75rem',
  fontSize: '0.9rem',
  opacity: 0.7,
  '&:hover': { opacity: 1, textDecoration: 'underline' },
})
