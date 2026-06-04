import { clientEntry, css, type Handle } from 'remix/ui'

// Theme colors inlined: app/ui/theme.ts is outside the asset server's allow
// list. The hex values match the `light.500` token in `app/ui/theme.ts`.
const LIGHT_500 = '#f1eee4'

/**
 * Client-side root for the batch sticker upload flow. Task 1 scaffold:
 * renders a placeholder while the real stage state machine is filled in
 * (Tasks 3+). Server-renders as a static "loading" container — without
 * JS the user just sees the placeholder text, which is harmless.
 */
export const BatchUploadStickersApp = clientEntry(
  import.meta.url,
  function BatchUploadStickersApp(_handle: Handle<{}>) {
    return () => (
      <div mix={placeholderStyle}>
        <p>Batch upload UI loading…</p>
      </div>
    )
  },
)

const placeholderStyle = css({
  padding: '2rem',
  border: `2px dashed ${LIGHT_500}66`,
  textAlign: 'center',
  borderRadius: '0.5rem',
})
