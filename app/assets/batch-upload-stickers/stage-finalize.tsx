import { css, on, ref, type Handle, type RemixNode } from 'remix/ui'

import type { TransparencyResult } from './transparency.ts'

// Theme colors inlined — see `controller.tsx` for the rationale (assets are
// outside the `app/ui/theme.ts` allow list). Hex values match `light.500`,
// `primary.500`, and `dark.500`.
const LIGHT_500 = '#f1eee4'
const PRIMARY_500 = '#f7a1c4'
const DARK_500 = '#1c0f13'
const SUCCESS = '#4ade80'
const DANGER = '#ef4444'

const CHECKER_LIGHT = '#222'
const CHECKER_DARK = '#1a1a1a'
const CHECKER_SIZE = '12px'

export interface StageFinalizeItem {
  regionId: string
  result: TransparencyResult
}

export interface StageFinalizeProps {
  /**
   * Approved transparency results — the controller has already filtered out
   * skipped items, so every entry here is meant to be uploaded.
   */
  items: StageFinalizeItem[]
  /** Current user's username; used to compose the post-upload success link. */
  username: string
  /** Resolved `routes.uploadSticker.action.href()` — the existing form action. */
  uploadStickerUrl: string
  /** Resolved `routes.profile.href({ username })` — main success destination. */
  profileUrl: string
  /** Resolved `routes.stickers.href()` — fallback success destination. */
  stickersUrl: string
  /**
   * Return to the transparency stage. The button is only rendered while no
   * upload has succeeded yet; once a sticker exists server-side, going
   * backward doesn't undo it and would confuse the user.
   */
  onBack: () => void
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'success'; stickerSlug: string }
  | { status: 'error'; message: string }

interface ItemView {
  regionId: string
  result: TransparencyResult
  /** Object URL for the transparent PNG thumbnail. Revoked on unmount. */
  previewUrl: string
}

/**
 * Convert a human name into a filename-safe slug. Used only for the
 * outgoing PNG filename — the server generates its own slug from the
 * sticker name when it creates the row, so this string is purely
 * cosmetic in network panels.
 */
function slugify(name: string): string {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed) return 'sticker'
  return trimmed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sticker'
}

/**
 * Pull the trailing path segment from a URL. The existing `/upload-sticker`
 * action redirects to `/sticker/<slug>` on success, so the last non-empty
 * segment of `res.url` is the new sticker's slug. Returns `''` if we can't
 * find anything useful; the caller falls back to a generic success state.
 */
function slugFromUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin)
    const parts = parsed.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] ?? ''
  } catch {
    return ''
  }
}

/**
 * Finalize-stage component. Renders the per-sticker grid, drives the
 * sequential upload loop, and surfaces success/error per card.
 *
 * Upload strategy:
 *   - We POST each sticker to `uploadStickerUrl` (the existing form action)
 *     with `redirect: 'follow'`. The server returns a 303 to
 *     `/sticker/<slug>` on success; fetch transparently follows the redirect
 *     and we see `res.url` ending in `/sticker/<slug>` and `res.ok === true`.
 *   - With `redirect: 'manual'` we'd get an opaque response and couldn't
 *     read `res.url`, so we accept the extra round-trip to the sticker page
 *     in exchange for being able to surface the new slug.
 *   - On a 4xx (most often a validation failure), `res.url` equals the
 *     request URL (the action re-renders the form), so we read the response
 *     body and show that text in the error tile.
 *
 * Sequential uploads, not parallel: parallel uploads would race the server's
 * unique-slug generation for stickers with the same name, and the UI would
 * be harder to reason about. Sequential keeps the counter honest.
 */
export function StageFinalize(handle: Handle<StageFinalizeProps>): () => RemixNode {
  // Build object URLs for the thumbnail previews up front; revoke them all
  // when the stage unmounts via the handle's abort signal.
  const items: ItemView[] = handle.props.items.map((item) => ({
    regionId: item.regionId,
    result: item.result,
    previewUrl: URL.createObjectURL(item.result.pngBlob),
  }))

  const states = new Map<string, UploadState>()
  const names = new Map<string, string>()
  const total = items.length
  for (let i = 0; i < total; i++) {
    const item = items[i]!
    states.set(item.regionId, { status: 'idle' })
    names.set(item.regionId, `sticker ${i + 1} of ${total}`)
  }

  let batchError: string | null = null
  let uploading = false

  function setStatus(id: string, next: UploadState): void {
    states.set(id, next)
    handle.update()
  }

  function setName(id: string, value: string): void {
    names.set(id, value)
    // No re-render required — the input is uncontrolled. We mutate the map
    // so that subsequent uploads pick up the new name.
  }

  function setBatchError(message: string | null): void {
    batchError = message
    handle.update()
  }

  function setUploading(next: boolean): void {
    uploading = next
    handle.update()
  }

  function successCount(): number {
    let n = 0
    for (const s of states.values()) if (s.status === 'success') n += 1
    return n
  }

  function anyUploading(): boolean {
    for (const s of states.values()) if (s.status === 'uploading') return true
    return false
  }

  function getCsrfToken(): string | null {
    const meta = document.querySelector('meta[name="csrf-token"]')
    return meta?.getAttribute('content') ?? null
  }

  /**
   * Upload a single item. Extracted so the "Retry" button on a failed card
   * can re-run just one iteration of the loop. Returns the terminal state
   * for the caller, mainly so retries can `await` a single upload without
   * looping over a whole batch.
   */
  async function uploadOne(
    item: ItemView,
    csrfToken: string,
    index: number,
  ): Promise<void> {
    setStatus(item.regionId, { status: 'uploading' })
    const rawName = names.get(item.regionId) ?? `sticker ${index + 1} of ${total}`
    const name = rawName.trim() || `sticker ${index + 1} of ${total}`
    const file = new File([item.result.pngBlob], `${slugify(name)}.png`, {
      type: 'image/png',
    })
    const form = new FormData()
    form.set('_csrf', csrfToken)
    form.set('name', name)
    form.set('image', file)

    let res: Response
    try {
      res = await fetch(handle.props.uploadStickerUrl, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        // `follow` lets us read `res.url` after the 303 → /sticker/<slug>
        // redirect resolves. See the doc comment on the component for why
        // we don't use `manual` (opaque response, no headers).
        redirect: 'follow',
      })
    } catch (error) {
      setStatus(item.regionId, { status: 'error', message: String(error) })
      return
    }

    // Followed-redirect: server returned 303 → final page is /sticker/<slug>
    // and `res.url` reflects that. The 4xx error path re-renders the form at
    // the same URL we POSTed to, so `res.url === uploadStickerUrl` is a
    // strong signal that the upload failed even when the server response is
    // ok-ish (the form re-render is a 400, but the response body is HTML
    // and the URL hasn't changed).
    if (res.ok && res.url && res.url !== handle.props.uploadStickerUrl) {
      const slug = slugFromUrl(res.url)
      setStatus(item.regionId, { status: 'success', stickerSlug: slug })
      return
    }
    if (res.ok) {
      // Server returned 200 with no redirect; treat as success but we
      // don't know the slug. The success link still works via /stickers.
      setStatus(item.regionId, { status: 'success', stickerSlug: '' })
      return
    }
    // Non-2xx: surface the response body (probably an error message).
    let message: string
    try {
      const text = await res.text()
      const trimmed = text.trim()
      // The form re-render is full HTML; show a short stub instead of
      // dumping markup into the tile. Real text errors flow through.
      if (/^\s*</.test(trimmed)) {
        message = `validation failed (HTTP ${res.status})`
      } else {
        message = trimmed.slice(0, 200) || `HTTP ${res.status}`
      }
    } catch {
      message = `HTTP ${res.status}`
    }
    setStatus(item.regionId, { status: 'error', message })
  }

  async function uploadAll(): Promise<void> {
    if (uploading) return
    const csrfToken = getCsrfToken()
    if (!csrfToken) {
      setBatchError('Missing CSRF token; please refresh the page and try again.')
      return
    }
    setBatchError(null)
    setUploading(true)
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!
        // Skip already-uploaded items so "Upload all" after a partial failure
        // only retries the ones that weren't successful last time.
        if (states.get(item.regionId)?.status === 'success') continue
        await uploadOne(item, csrfToken, i)
      }
    } finally {
      setUploading(false)
    }
  }

  async function retryOne(regionId: string): Promise<void> {
    const csrfToken = getCsrfToken()
    if (!csrfToken) {
      setBatchError('Missing CSRF token; please refresh the page and try again.')
      return
    }
    const index = items.findIndex((it) => it.regionId === regionId)
    if (index < 0) return
    setBatchError(null)
    await uploadOne(items[index]!, csrfToken, index)
  }

  function onMount(_node: Element, signal: AbortSignal): void {
    signal.addEventListener('abort', () => {
      for (const view of items) URL.revokeObjectURL(view.previewUrl)
    })
  }

  function onNameInputMount(node: Element, signal: AbortSignal, regionId: string): void {
    if (!(node instanceof HTMLInputElement)) return
    node.addEventListener(
      'input',
      () => {
        setName(regionId, node.value)
      },
      { signal },
    )
  }

  return () => {
    const done = successCount()
    const allDone = done === total && total > 0
    const showBack = !uploading && done === 0

    return (
      <div mix={[rootStyle, ref(onMount)]}>
        <div mix={topBarStyle}>
          <button
            type="button"
            mix={[primaryBtnStyle, on('click', () => void uploadAll())]}
            disabled={uploading || allDone || total === 0}
          >
            {uploading
              ? 'uploading…'
              : allDone
                ? 'all uploaded'
                : done > 0
                  ? 'continue upload'
                  : 'upload all'}
          </button>
          <span mix={counterStyle}>
            {done} of {total} uploaded
          </span>
          {allDone ? (
            <a
              mix={successLinkStyle}
              href={
                handle.props.username
                  ? handle.props.profileUrl
                  : handle.props.stickersUrl
              }
            >
              done! view your stickers →
            </a>
          ) : null}
        </div>

        {batchError ? <p mix={batchErrorStyle}>{batchError}</p> : null}

        {total === 0 ? (
          <p mix={emptyStyle}>
            nothing to upload — every sticker was skipped on the transparency
            screen.
          </p>
        ) : (
          <div mix={gridStyle}>
            {items.map((item, index) =>
              renderCard(
                item,
                index,
                states.get(item.regionId) ?? { status: 'idle' },
                names.get(item.regionId) ?? '',
                uploading,
                (rid) => void retryOne(rid),
                onNameInputMount,
              ),
            )}
          </div>
        )}

        <div mix={bottomBarStyle}>
          {showBack ? (
            <button type="button" mix={[btnStyle, on('click', () => handle.props.onBack())]}>
              ← back to transparency
            </button>
          ) : null}
          <span mix={spacerStyle} />
          {allDone ? (
            <a mix={successLinkStyle} href={handle.props.profileUrl}>
              view your profile →
            </a>
          ) : null}
        </div>
      </div>
    )
  }
}

/**
 * Render one finalize card. Extracted out of the main render closure so
 * the top-level function stays scannable. Each card is a small column:
 * thumbnail, name input, status pill, optional retry button.
 */
function renderCard(
  item: ItemView,
  index: number,
  state: UploadState,
  name: string,
  uploading: boolean,
  retry: (regionId: string) => void,
  onNameInputMount: (node: Element, signal: AbortSignal, regionId: string) => void,
): RemixNode {
  return (
    <div mix={cardStyle} key={item.regionId}>
      <div mix={tileStyle}>
        <img src={item.previewUrl} alt={name} mix={tileImageStyle} />
      </div>
      <input
        type="text"
        mix={[
          nameInputStyle,
          ref((node, signal) => onNameInputMount(node, signal, item.regionId)),
        ]}
        value={name}
        placeholder={`sticker ${index + 1} of ?`}
        disabled={state.status === 'uploading' || state.status === 'success'}
      />
      {renderStatusRow(item, state, uploading, retry)}
    </div>
  )
}

function renderStatusRow(
  item: ItemView,
  state: UploadState,
  uploading: boolean,
  retry: (regionId: string) => void,
): RemixNode {
  if (state.status === 'idle') {
    return <p mix={[statusLineStyle, statusIdleStyle]}>ready</p>
  }
  if (state.status === 'uploading') {
    return <p mix={[statusLineStyle, statusUploadingStyle]}>uploading…</p>
  }
  if (state.status === 'success') {
    return (
      <p mix={[statusLineStyle, statusSuccessStyle]}>
        ✓ uploaded
        {state.stickerSlug ? (
          <>
            {' · '}
            <a mix={inlineLinkStyle} href={`/sticker/${state.stickerSlug}`}>
              view
            </a>
          </>
        ) : null}
      </p>
    )
  }
  // error
  return (
    <div mix={errorBlockStyle}>
      <p mix={[statusLineStyle, statusErrorStyle]}>✕ {state.message}</p>
      <button
        type="button"
        mix={[retryBtnStyle, on('click', () => retry(item.regionId))]}
        disabled={uploading}
      >
        retry
      </button>
    </div>
  )
}

const rootStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
})

const topBarStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.75rem',
})

const counterStyle = css({
  fontSize: '0.875rem',
  opacity: 0.85,
  fontVariantNumeric: 'tabular-nums',
})

const successLinkStyle = css({
  color: SUCCESS,
  fontSize: '0.875rem',
  fontWeight: 600,
  textDecoration: 'none',
  '&:hover': { textDecoration: 'underline' },
})

const inlineLinkStyle = css({
  color: 'inherit',
  textDecoration: 'underline',
})

const batchErrorStyle = css({
  margin: 0,
  color: PRIMARY_500,
  fontSize: '0.875rem',
})

const emptyStyle = css({
  margin: 0,
  padding: '1rem',
  border: `1px dashed ${LIGHT_500}33`,
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  opacity: 0.8,
  textAlign: 'center',
})

const gridStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem',
})

const cardStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  width: '12.5rem',
  padding: '0.5rem',
  borderRadius: '0.5rem',
  border: `1px solid ${LIGHT_500}22`,
  background: `${LIGHT_500}08`,
})

// Checkerboard backdrop: identical pattern to stage-transparency.tsx so the
// before/after visual continuity carries through to the final step.
const tileStyle = css({
  position: 'relative',
  height: '10rem',
  borderRadius: '0.25rem',
  overflow: 'hidden',
  border: `1px solid ${LIGHT_500}1a`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: CHECKER_DARK,
  backgroundImage: `
    linear-gradient(45deg, ${CHECKER_LIGHT} 25%, transparent 25%),
    linear-gradient(-45deg, ${CHECKER_LIGHT} 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, ${CHECKER_LIGHT} 75%),
    linear-gradient(-45deg, transparent 75%, ${CHECKER_LIGHT} 75%)
  `,
  backgroundSize: `${CHECKER_SIZE} ${CHECKER_SIZE}`,
  backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
})

const tileImageStyle = css({
  maxWidth: '100%',
  maxHeight: '10rem',
  objectFit: 'contain',
  display: 'block',
})

const nameInputStyle = css({
  background: 'transparent',
  color: LIGHT_500,
  border: `1px solid ${LIGHT_500}44`,
  borderRadius: '0.25rem',
  font: 'inherit',
  fontSize: '0.875rem',
  padding: '0.25rem 0.5rem',
  '&:focus': { outline: 'none', borderColor: PRIMARY_500 },
  '&:disabled': { opacity: 0.55 },
})

const statusLineStyle = css({
  margin: 0,
  fontSize: '0.75rem',
  fontVariantNumeric: 'tabular-nums',
  wordBreak: 'break-word',
})

const statusIdleStyle = css({ opacity: 0.6 })
const statusUploadingStyle = css({ opacity: 0.85 })
const statusSuccessStyle = css({ color: SUCCESS })
const statusErrorStyle = css({ color: DANGER })

const errorBlockStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
})

const spacerStyle = css({ flex: 1 })

const btnStyle = css({
  background: 'transparent',
  color: LIGHT_500,
  border: `1px solid ${LIGHT_500}66`,
  borderRadius: '0.25rem',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '0.875rem',
  padding: '0.375rem 0.75rem',
  '&:hover:not(:disabled)': { borderColor: PRIMARY_500 },
  '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
})

const primaryBtnStyle = css({
  background: LIGHT_500,
  color: DARK_500,
  border: `1px solid ${LIGHT_500}`,
  borderRadius: '0.25rem',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '0.875rem',
  fontWeight: 600,
  padding: '0.5rem 1rem',
  '&:hover:not(:disabled)': { background: PRIMARY_500, borderColor: PRIMARY_500 },
  '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
})

const retryBtnStyle = css({
  alignSelf: 'flex-start',
  background: 'transparent',
  color: LIGHT_500,
  border: `1px solid ${LIGHT_500}66`,
  borderRadius: '0.25rem',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '0.75rem',
  padding: '0.125rem 0.5rem',
  '&:hover:not(:disabled)': { borderColor: PRIMARY_500 },
  '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
})

const bottomBarStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  paddingTop: '0.5rem',
  borderTop: `1px solid ${LIGHT_500}1a`,
})
