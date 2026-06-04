import { getContext } from 'remix/middleware/async-context'
import { getCsrfToken } from 'remix/middleware/csrf'
import { css } from 'remix/ui'

import { BatchUploadStickersApp } from '../assets/batch-upload-stickers/controller.tsx'
import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'

export interface BatchUploadStickersPageProps {
  user: HeaderUser
}

export function BatchUploadStickersPage() {
  return ({ user }: BatchUploadStickersPageProps) => {
    // Self-resolve the CSRF token here (same pattern as `CsrfField`); the
    // client bundle reads it back from the `<meta>` tag to POST to
    // `/upload-sticker` from JS without a server-rendered form.
    const csrfToken = getCsrfToken(getContext())
    return (
      <Document
        title="batch upload stickers - stickertrade"
        user={user}
        head={<meta name="csrf-token" content={csrfToken} />}
      >
        <main mix={mainStyle}>
          <h1>batch upload stickers</h1>
          <p mix={blurbStyle}>
            upload one photo of multiple stickers laid out on a flat surface.
            we'll detect each sticker, remove backgrounds, and let you review
            before uploading them all.
          </p>
          <BatchUploadStickersApp />
        </main>
      </Document>
    )
  }
}

const mainStyle = css({
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '1rem',
})

const blurbStyle = css({
  marginBottom: '1.5rem',
  opacity: 0.8,
})
