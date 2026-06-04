import { getContext } from 'remix/middleware/async-context'
import { getCsrfToken } from 'remix/middleware/csrf'
import { css } from 'remix/ui'

import { BatchUploadStickersApp } from '../assets/batch-upload-stickers/controller.tsx'
import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'

export interface BatchUploadStickersPageProps {
  user: HeaderUser
}

// Pinned version for `@huggingface/transformers`. Must match the version in
// package.json so types and runtime behaviour stay in sync. The asset server
// is told to leave the bare specifier `@huggingface/transformers` untouched
// (see `app/assets.ts`), and the importmap below redirects it to the CDN
// build at runtime — sidestepping the asset server's CJS-detector tripping
// on onnxruntime-web's prebuilt ESM bundles.
const TRANSFORMERS_VERSION = '4.2.0'
const TRANSFORMERS_CDN = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/+esm`

export function BatchUploadStickersPage() {
  return ({ user }: BatchUploadStickersPageProps) => {
    // Self-resolve the CSRF token here (same pattern as `CsrfField`); the
    // client bundle reads it back from the `<meta>` tag to POST to
    // `/upload-sticker` from JS without a server-rendered form.
    const csrfToken = getCsrfToken(getContext())
    const importmap = JSON.stringify({
      imports: {
        '@huggingface/transformers': TRANSFORMERS_CDN,
      },
    })
    return (
      <Document
        title="stickertrade - batch upload stickers"
        user={user}
        head={
          <>
            <meta name="csrf-token" content={csrfToken} />
            {/* The importmap MUST appear in <head> before any module script,
                otherwise the browser ignores it and the bare specifier
                `@huggingface/transformers` fails to resolve. */}
            <script type="importmap" innerHTML={importmap} />
          </>
        }
      >
        <main mix={mainStyle}>
          <h1 mix={headingStyle}>batch upload stickers</h1>
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
  maxWidth: '75rem',
  margin: '0 auto',
  padding: '1rem',
})

const headingStyle = css({
  fontSize: '1.5rem',
  marginBottom: '1rem',
})

const blurbStyle = css({
  marginBottom: '1.5rem',
  opacity: 0.8,
})
