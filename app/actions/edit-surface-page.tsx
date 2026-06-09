import { css, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { Document } from '../ui/document.tsx'
import {
  CsrfField,
  SubmitButton,
  TextField,
  errorStyle,
  fieldStyle,
  flashStyle,
  inputStyle,
} from '../ui/form.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { colors } from '../ui/theme.ts'

const MAX_GALLERY_FILES = 8

export interface EditSurfacePageProps {
  user: HeaderUser
  surface: {
    id: string
    slug: string
    name: string
    description: string | null
  }
  images: Array<{
    id: string
    image_url: string
    is_primary: boolean
  }>
  errors?: { name?: string; description?: string; _form?: string }
  flash?: string
}

export function EditSurfacePage(handle: Handle<EditSurfacePageProps>) {
  return () => {
    const { user, surface, images, errors = {}, flash } = handle.props
    return (
    <Document title={`stickertrade - edit ${surface.name}`} user={user}>
      <main mix={css({ maxWidth: '32rem', margin: '0 auto' })}>
        <h1 mix={css({ fontSize: '1.5rem', marginBottom: '1rem' })}>edit surface</h1>
        {flash ? <p mix={flashStyle}>{flash}</p> : null}

        <form
          method="post"
          action={routes.editSurface.action.href({ slug: surface.slug })}
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
          {errors._form ? <p mix={errorStyle}>{errors._form}</p> : null}
          <div mix={css({ display: 'flex', gap: '0.5rem', alignItems: 'center' })}>
            <SubmitButton label="save changes" />
            <a href={routes.surface.href({ slug: surface.slug })} mix={cancelLinkStyle}>
              cancel
            </a>
          </div>
        </form>

        <section mix={gallerySectionStyle}>
          <h2 mix={css({ fontSize: '1.15rem', marginBottom: '0.75rem' })}>
            images ({images.length})
          </h2>
          {images.map((img) => (
            <div key={img.id} mix={galleryItemStyle}>
              <img src={img.image_url} alt="" mix={galleryImgStyle} />
              <div mix={galleryActionsStyle}>
                {img.is_primary ? (
                  <span mix={primaryBadgeStyle}>primary</span>
                ) : (
                  <form
                    method="post"
                    action={routes.setPrimarySurfaceImage.action.href({
                      slug: surface.slug,
                      imageId: img.id,
                    })}
                    style={{ display: 'inline' }}
                  >
                    <CsrfField />
                    <button type="submit" mix={inlineBtnStyle}>set primary</button>
                  </form>
                )}
                <form
                  method="post"
                  action={routes.removeSurfaceImage.action.href({
                    slug: surface.slug,
                    imageId: img.id,
                  })}
                  style={{ display: 'inline' }}
                >
                  <CsrfField />
                  <button
                    type="submit"
                    mix={inlineBtnStyle}
                    disabled={images.length <= 1}
                  >
                    remove
                  </button>
                </form>
              </div>
            </div>
          ))}

          {images.length < MAX_GALLERY_FILES ? (
            <form
              method="post"
              action={routes.addSurfaceImage.action.href({ slug: surface.slug })}
              encType="multipart/form-data"
              mix={addImageFormStyle}
            >
              <CsrfField />
              <input
                type="file"
                name="image"
                accept="image/png,image/jpeg,image/webp"
                required
              />
              <button type="submit" mix={inlineBtnStyle}>add image</button>
            </form>
          ) : null}
        </section>
      </main>
    </Document>
    )
  }
}

const textareaExtraStyle = css({
  minHeight: '8rem',
  resize: 'vertical',
  fontFamily: 'inherit',
})

const cancelLinkStyle = css({
  marginTop: '0.75rem',
  fontSize: '0.9rem',
  opacity: 0.7,
  '&:hover': { opacity: 1, textDecoration: 'underline' },
})

const gallerySectionStyle = css({
  marginTop: '2rem',
})

const galleryItemStyle = css({
  marginBottom: '1.5rem',
  border: `2px solid ${colors.light[500]}40`,
  padding: '0.5rem',
})

const galleryImgStyle = css({
  width: '100%',
  maxHeight: '22rem',
  objectFit: 'contain',
  display: 'block',
  background: '#000',
})

const galleryActionsStyle = css({
  marginTop: '0.5rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
})

const primaryBadgeStyle = css({
  padding: '0.25rem 0.5rem',
  fontSize: '0.85rem',
  background: colors.primary[500],
  color: colors.dark[500],
  fontWeight: 600,
})

const addImageFormStyle = css({
  marginTop: '1rem',
  padding: '0.75rem',
  border: `2px dashed ${colors.light[500]}55`,
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'center',
  flexWrap: 'wrap',
})

const inlineBtnStyle = css({
  padding: '0.35rem 0.75rem',
  background: colors.light[500],
  color: colors.dark[500],
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '0.85rem',
  fontWeight: 600,
  '&:hover': { background: colors.light[600] },
  '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
})
