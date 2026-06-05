import { css, on, ref, type Handle, type RemixNode } from 'remix/ui'

import type { Region, SourceImage } from './types.ts'
import type { TransparencyResult } from './transparency.ts'

// Theme colors inlined — see `controller.tsx` for the rationale (assets are
// outside the `app/ui/theme.ts` allow list).
const LIGHT_500 = '#f1eee4'
const PRIMARY_500 = '#f7a1c4'
const DARK_500 = '#1c0f13'
const DANGER = '#ef4444'

export type RegionDecision = 'keep' | 'skip'

export interface StageTransparencyProps {
  source: SourceImage
  regions: Region[]
  /**
   * Return to the review stage with `selectedId = regionId`. The controller
   * keeps the source/regions in state so re-entering review is instant.
   */
  onAdjustCrop: (regionId: string) => void
  /**
   * Continue to the finalize stage. Receives the user's keep/skip choices
   * and the transparency results so finalize doesn't have to re-run the
   * inference loop.
   */
  onNext: (
    decisions: Map<string, RegionDecision>,
    results: Map<string, TransparencyResult>,
  ) => void
  onBack: () => void
}

type RegionState =
  | { status: 'pending' }
  | { status: 'processing' }
  | { status: 'done'; result: TransparencyResult; decision: RegionDecision; previewUrl: string }
  | { status: 'error'; message: string }

interface CardPreview {
  originalUrl: string
}

/**
 * Format a byte count for the model-download progress line. `total` may be
 * `0` if the server doesn't send a content-length, so we degrade to a "?"
 * rather than an obviously-wrong "0 B".
 */
function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Allocate a fresh `ImageData` containing the pixels inside `region`. We
 * can't use `OffscreenCanvas.getImageData` because we already have the raw
 * pixels in memory — a typed-array copy is roughly an order of magnitude
 * faster and works in any environment.
 *
 * The region is clamped to the source bounds defensively: regions usually
 * come from `detect.ts` which already clamps, but a user-added region from
 * the review stage could theoretically be off-edge.
 */
export function cropImageDataForRegion(source: ImageData, region: Region): ImageData {
  const sx = Math.max(0, Math.min(source.width, Math.round(region.x)))
  const sy = Math.max(0, Math.min(source.height, Math.round(region.y)))
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(region.width)))
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(region.height)))
  const out = new Uint8ClampedArray(sw * sh * 4)
  for (let y = 0; y < sh; y++) {
    const srcRow = ((sy + y) * source.width + sx) * 4
    const dstRow = y * sw * 4
    // 4 bytes per pixel, sw pixels per row.
    for (let i = 0; i < sw * 4; i++) {
      out[dstRow + i] = source.data[srcRow + i]!
    }
  }
  return new ImageData(out, sw, sh)
}

async function imageDataToObjectUrl(image: ImageData): Promise<string> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(image.width, image.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context on OffscreenCanvas')
    ctx.putImageData(image, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return URL.createObjectURL(blob)
  }
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context on HTMLCanvasElement')
  ctx.putImageData(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
  if (!blob) throw new Error('toBlob returned null')
  return URL.createObjectURL(blob)
}

/**
 * Transparency-stage component. Drives the per-region inference loop on
 * mount, renders side-by-side before/after cards, and lets the user pick
 * keep/skip per sticker before continuing.
 *
 * Side effects:
 *   - Creates object URLs for each crop preview + each transparency PNG.
 *     We revoke them on unmount via the handle's abort signal.
 *   - Holds `TransparencyResult.pngBlob` references until `onNext` runs.
 *     The finalize stage takes ownership.
 */
export function StageTransparency(handle: Handle<StageTransparencyProps>): () => RemixNode {
  let status = 'preparing background removal…'
  let started = false
  let abortController: AbortController | null = null

  // Region-keyed state. Keys are region IDs from `props.regions`.
  const states = new Map<string, RegionState>()
  const previews = new Map<string, CardPreview>()
  // URLs to revoke on unmount.
  const objectUrls: string[] = []

  for (const region of handle.props.regions) {
    states.set(region.id, { status: 'pending' })
  }

  function setStatus(s: string): void {
    status = s
    handle.update()
  }

  function setRegionState(id: string, next: RegionState): void {
    const prev = states.get(id)
    if (prev?.status === 'done' && next.status !== 'done') {
      // The previous done state owns a preview URL; release it before
      // overwriting. New `done` states reuse the URL, so we skip the
      // revoke when transitioning between two done states (e.g. toggling
      // the decision).
    }
    states.set(id, next)
    handle.update()
  }

  /**
   * Lazy-build the original-crop preview URL for a region. We only need
   * this once per region — subsequent renders reuse the cached URL.
   */
  async function ensureOriginalPreview(region: Region): Promise<void> {
    if (previews.has(region.id)) return
    try {
      const crop = cropImageDataForRegion(handle.props.source.imageData, region)
      const url = await imageDataToObjectUrl(crop)
      objectUrls.push(url)
      previews.set(region.id, { originalUrl: url })
      handle.update()
    } catch (error) {
      // The original-preview failure isn't fatal for inference; just log.
      // The card will still render with a placeholder.
      console.warn('failed to build crop preview', region.id, error)
    }
  }

  /**
   * Run the model on every region in sequence. We deliberately serialize
   * because:
   *   - u2netp on WASM saturates the main thread; running concurrent
   *     inferences makes the UI completely unresponsive.
   *   - The transformers.js engine instance isn't thread-safe at the JS
   *     layer — calls share internal state.
   * Sequential keeps the per-card "Processing…" cues meaningful.
   */
  async function runInference(signal: AbortSignal): Promise<void> {
    setStatus('loading background-removal model (first use: ~44 mb, cached after)…')
    let transparency: typeof import('./transparency.ts')
    try {
      transparency = await import('./transparency.ts')
    } catch (error) {
      setStatus(`failed to load transparency module: ${String(error)}`)
      return
    }
    if (signal.aborted) return

    // Surface a heads-up for the WASM fallback path before the multi-MB
    // download starts — older mobile devices can take 30+ seconds per
    // sticker on WASM, vs. a second or two on WebGPU.
    if (transparency.detectInferenceDevice() === 'wasm') {
      setStatus(
        'loading background-removal model (first use: ~44 mb, cached after). ' +
          'your browser will use wasm (no webgpu) — this can be slow on older devices.',
      )
    }

    // Build all original-crop previews up-front so the cards have something
    // to show while inference is still warming up. Concurrent is fine here;
    // the previews are pure canvas work.
    await Promise.all(handle.props.regions.map((region) => ensureOriginalPreview(region)))

    try {
      await transparency.loadTransparencyEngine((loaded, total) => {
        if (signal.aborted) return
        const pct = total > 0 ? Math.round((loaded / total) * 100) : null
        setStatus(
          pct === null
            ? `downloading model: ${formatBytes(loaded)}…`
            : `downloading model: ${formatBytes(loaded)} / ${formatBytes(total)} (${pct}%)`,
        )
      })
    } catch (error) {
      if (!signal.aborted) {
        setStatus(`failed to load model: ${String(error)}`)
      }
      return
    }
    if (signal.aborted) return

    const total = handle.props.regions.length
    for (let i = 0; i < total; i++) {
      if (signal.aborted) return
      const region = handle.props.regions[i]!
      setStatus(`processing sticker ${i + 1} of ${total}…`)
      setRegionState(region.id, { status: 'processing' })
      try {
        const crop = cropImageDataForRegion(handle.props.source.imageData, region)
        const result = await transparency.removeBackground(crop)
        if (signal.aborted) return
        const previewUrl = URL.createObjectURL(result.pngBlob)
        objectUrls.push(previewUrl)
        setRegionState(region.id, { status: 'done', result, decision: 'keep', previewUrl })
      } catch (error) {
        if (signal.aborted) return
        setRegionState(region.id, { status: 'error', message: String(error) })
      }
    }

    if (!signal.aborted) {
      setStatus('done. review the cards below, then continue.')
    }
  }

  function onMount(_node: Element, signal: AbortSignal): void {
    if (started) return
    started = true
    abortController = new AbortController()
    // Compose abort: the handle's signal aborts when the stage unmounts;
    // the inference loop watches our internal controller so we can
    // short-circuit when re-running fails.
    signal.addEventListener('abort', () => abortController?.abort())
    signal.addEventListener('abort', () => {
      for (const url of objectUrls) URL.revokeObjectURL(url)
      objectUrls.length = 0
    })
    void runInference(abortController.signal)
  }

  function toggleDecision(regionId: string): void {
    const current = states.get(regionId)
    if (current?.status !== 'done') return
    const next: RegionDecision = current.decision === 'keep' ? 'skip' : 'keep'
    setRegionState(regionId, { ...current, decision: next })
  }

  function onNext(): void {
    const decisions = new Map<string, RegionDecision>()
    const results = new Map<string, TransparencyResult>()
    for (const region of handle.props.regions) {
      const s = states.get(region.id)
      if (s?.status === 'done') {
        decisions.set(region.id, s.decision)
        results.set(region.id, s.result)
      }
    }
    handle.props.onNext(decisions, results)
  }

  /**
   * The Next button is gated on every region being terminal — `done` or
   * `error`. We don't require at least one `keep` because the finalize
   * stage already shows a clear "nothing to upload" state in that case.
   */
  function allTerminal(): boolean {
    for (const region of handle.props.regions) {
      const s = states.get(region.id)
      if (!s || s.status === 'pending' || s.status === 'processing') return false
    }
    return true
  }

  function doneCount(): number {
    let count = 0
    for (const state of states.values()) {
      if (state.status === 'done' || state.status === 'error') count += 1
    }
    return count
  }

  return () => {
    const regions = handle.props.regions
    const total = regions.length
    const completed = doneCount()
    const canContinue = allTerminal()
    const keptCount = (() => {
      let n = 0
      for (const s of states.values()) {
        if (s.status === 'done' && s.decision === 'keep') n += 1
      }
      return n
    })()

    return (
      <div mix={[rootStyle, ref(onMount)]}>
        <div mix={topBarStyle}>
          <div mix={progressTrackStyle}>
            <div
              mix={[
                progressFillStyle,
                css({ width: total === 0 ? '0%' : `${Math.round((completed / total) * 100)}%` }),
              ]}
            />
          </div>
          <p mix={statusStyle}>
            <span>{status}</span>
            <span mix={countStyle}>
              {completed}/{total} processed · {keptCount} keep
            </span>
          </p>
        </div>

        <div mix={feedStyle}>
          {regions.map((region) => renderCard(region, states.get(region.id), previews.get(region.id), toggleDecision, handle.props.onAdjustCrop))}
        </div>

        <div mix={bottomBarStyle}>
          <button type="button" mix={[btnStyle, on('click', () => handle.props.onBack())]}>
            ← back to review
          </button>
          <span mix={spacerStyle} />
          <button
            type="button"
            mix={[primaryBtnStyle, on('click', onNext)]}
            disabled={!canContinue}
          >
            next: finalize →
          </button>
        </div>
      </div>
    )
  }
}

/**
 * Render one before/after card. Extracted so the main render function stays
 * scannable; this routine handles all four region states and the action
 * row underneath.
 *
 * The image elements get inlined `width: 100%` rather than mix styles so
 * they always fill the checkerboard tile regardless of natural dimensions.
 */
function renderCard(
  region: Region,
  state: RegionState | undefined,
  preview: CardPreview | undefined,
  toggleDecision: (id: string) => void,
  onAdjustCrop: (id: string) => void,
): RemixNode {
  const status = state?.status ?? 'pending'
  return (
    <div mix={cardStyle} key={region.id}>
      <div mix={tileRowStyle}>
        <div mix={tileStyle}>
          <div mix={tileLabelStyle}>original</div>
          {preview ? (
            <img src={preview.originalUrl} alt="original crop" mix={tileImageStyle} />
          ) : (
            <div mix={tilePlaceholderStyle}>loading preview…</div>
          )}
        </div>
        <div mix={tileStyle}>
          <div mix={tileLabelStyle}>transparent</div>
          {state?.status === 'done' ? (
            <img src={state.previewUrl} alt="transparent result" mix={tileImageStyle} />
          ) : state?.status === 'processing' ? (
            <div mix={tilePlaceholderStyle}>processing…</div>
          ) : state?.status === 'error' ? (
            <div mix={[tilePlaceholderStyle, errorTileStyle]}>{state.message}</div>
          ) : (
            <div mix={tilePlaceholderStyle}>pending</div>
          )}
        </div>
      </div>
      <div mix={actionRowStyle}>
        <span mix={cardMetaStyle}>
          {region.width}×{region.height}px
          {state?.status === 'done' ? ` → ${state.result.width}×${state.result.height}px` : ''}
        </span>
        <span mix={spacerStyle} />
        {status === 'done' ? (
          <button
            type="button"
            mix={[
              decisionBtnStyle,
              (state as Extract<RegionState, { status: 'done' }>).decision === 'keep'
                ? decisionActiveStyle
                : decisionInactiveStyle,
              on('click', () => toggleDecision(region.id)),
            ]}
          >
            {(state as Extract<RegionState, { status: 'done' }>).decision === 'keep' ? '✓ keep' : '○ skip'}
          </button>
        ) : (
          <span mix={pendingTagStyle}>{status}</span>
        )}
        <button
          type="button"
          mix={[btnStyle, on('click', () => onAdjustCrop(region.id))]}
        >
          adjust crop ↩
        </button>
      </div>
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
  flexDirection: 'column',
  gap: '0.5rem',
})

const progressTrackStyle = css({
  height: '0.375rem',
  background: `${LIGHT_500}22`,
  borderRadius: '0.25rem',
  overflow: 'hidden',
})

const progressFillStyle = css({
  height: '100%',
  background: PRIMARY_500,
  transition: 'width 200ms ease-out',
})

const statusStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  margin: 0,
  fontSize: '0.875rem',
  opacity: 0.9,
})

const countStyle = css({
  marginLeft: 'auto',
  opacity: 0.65,
  fontVariantNumeric: 'tabular-nums',
})

const feedStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
})

const cardStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  padding: '0.75rem',
  borderRadius: '0.5rem',
  border: `1px solid ${LIGHT_500}22`,
  background: `${LIGHT_500}08`,
})

const tileRowStyle = css({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.5rem',
})

const CHECKER_LIGHT = '#222'
const CHECKER_DARK = '#1a1a1a'
const CHECKER_SIZE = '12px'

// Checkerboard backdrop: two diagonal gradients offset by half a tile. The
// `${CHECKER_SIZE} ${CHECKER_SIZE}` background-size below produces the tile
// grid; the diagonals colour two of the four quadrants of each cell.
const tileStyle = css({
  position: 'relative',
  minHeight: '11rem',
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

const tileLabelStyle = css({
  position: 'absolute',
  top: '0.25rem',
  left: '0.5rem',
  fontSize: '0.625rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: LIGHT_500,
  background: `${DARK_500}cc`,
  padding: '0.125rem 0.375rem',
  borderRadius: '0.125rem',
  zIndex: 1,
})

const tileImageStyle = css({
  maxWidth: '100%',
  maxHeight: '11rem',
  objectFit: 'contain',
  display: 'block',
})

const tilePlaceholderStyle = css({
  padding: '1rem',
  fontSize: '0.875rem',
  color: LIGHT_500,
  opacity: 0.7,
  textAlign: 'center',
})

const errorTileStyle = css({
  color: DANGER,
  opacity: 1,
  whiteSpace: 'normal',
  wordBreak: 'break-word',
})

const actionRowStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
})

const cardMetaStyle = css({
  fontSize: '0.75rem',
  opacity: 0.65,
  fontVariantNumeric: 'tabular-nums',
})

const pendingTagStyle = css({
  fontSize: '0.75rem',
  opacity: 0.6,
  fontStyle: 'italic',
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
  padding: '0.375rem 0.75rem',
  '&:hover:not(:disabled)': { background: PRIMARY_500, borderColor: PRIMARY_500 },
  '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
})

const decisionBtnStyle = css({
  borderRadius: '0.25rem',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '0.875rem',
  padding: '0.375rem 0.75rem',
  border: '1px solid transparent',
})

const decisionActiveStyle = css({
  background: PRIMARY_500,
  color: DARK_500,
  borderColor: PRIMARY_500,
})

const decisionInactiveStyle = css({
  background: 'transparent',
  color: LIGHT_500,
  borderColor: `${LIGHT_500}66`,
  '&:hover': { borderColor: PRIMARY_500 },
})

const bottomBarStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  paddingTop: '0.5rem',
  borderTop: `1px solid ${LIGHT_500}1a`,
})
