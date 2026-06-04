import { clientEntry, css, type Handle } from 'remix/ui'

// Theme colors inlined: app/ui/theme.ts is outside the asset server's allow
// list. The hex values match the `light.500` token in `app/ui/theme.ts`.
const LIGHT_500 = '#f1eee4'

/**
 * Client-side root for the batch sticker upload flow. Task 1 scaffold:
 * renders a placeholder while the real stage state machine is filled in
 * (Tasks 3+). Without JS the user just sees the `<noscript>` fallback —
 * the feature is fundamentally JS-only (canvas, ML inference, fetch).
 */
export const BatchUploadStickersApp = clientEntry(
  import.meta.url,
  function BatchUploadStickersApp(_handle: Handle<{}>) {
    return () => (
      <div mix={placeholderStyle}>
        <p>loading batch upload…</p>
        <noscript>
          <p mix={noscriptStyle}>
            this page needs JavaScript. use the regular{' '}
            <a href="/upload-sticker">single sticker upload</a> instead.
          </p>
        </noscript>
      </div>
    )
  },
)

const placeholderStyle = css({
  padding: '2rem',
  border: `2px dashed ${LIGHT_500}66`,
  textAlign: 'center',
  borderRadius: '0.5rem',
  minHeight: '12rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
})

const noscriptStyle = css({
  opacity: 0.8,
})
