import { getContext } from 'remix/middleware/async-context'
import { getCsrfToken } from 'remix/middleware/csrf'
import { css } from 'remix/ui'

import { BatchUploadStickersApp } from '../assets/batch-upload-stickers/controller.tsx'
import { routes } from '../routes.ts'
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
          <h1 mix={headingStyle}>
            batch upload stickers <span mix={experimentalTagStyle}>experimental</span>
          </h1>
          <p mix={blurbStyle}>
            upload one photo of multiple stickers laid out on a flat surface.
            we'll detect each sticker, remove backgrounds, and let you review
            before uploading them all.
          </p>
          <aside mix={noticeStyle}>
            <p mix={noticeHeadingStyle}>heads up</p>
            <ul mix={noticeListStyle}>
              <li>
                this is a brand-new feature and may misbehave. if anything
                breaks, you can always fall back to the{' '}
                <a href={routes.uploadSticker.action.href()}>regular single-sticker
                upload</a>.
              </li>
              <li>
                background removal runs in your browser using a ~44 mb ml model.
                first use downloads it; later uses are cached.
              </li>
              <li>
                no images are sent to the server until the final step, and even
                then it's the existing sticker-upload endpoint. nothing leaves
                your device during detection or background removal.
              </li>
            </ul>
          </aside>
          <BatchUploadStickersApp
            username={user.username}
            uploadStickerUrl={routes.uploadSticker.action.href()}
            profileUrl={routes.profile.href({ username: user.username })}
            stickersUrl={routes.stickers.href()}
          />
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

// Theme colors inlined as hex on this page because we use them here directly;
// the rest of the feature lives under app/assets/ which can't reach theme.ts.
const experimentalTagStyle = css({
  display: 'inline-block',
  marginLeft: '0.5rem',
  padding: '0.125rem 0.5rem',
  fontSize: '0.75rem',
  fontWeight: 'normal',
  background: '#f59e0b',
  color: '#1c0f13',
  borderRadius: '0.25rem',
  verticalAlign: 'middle',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
})

const noticeStyle = css({
  border: '1px solid #f59e0b66',
  background: '#f59e0b14',
  borderRadius: '0.5rem',
  padding: '0.75rem 1rem',
  marginBottom: '1.5rem',
  fontSize: '0.875rem',
})

const noticeHeadingStyle = css({
  margin: 0,
  marginBottom: '0.5rem',
  fontWeight: 'bold',
  color: '#f59e0b',
})

const noticeListStyle = css({
  margin: 0,
  paddingLeft: '1.25rem',
  '& li': { marginBottom: '0.25rem' },
  '& li:last-child': { marginBottom: 0 },
  '& a': { textDecoration: 'underline' },
})
