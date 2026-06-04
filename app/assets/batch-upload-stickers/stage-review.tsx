import { css, on, ref, type Handle, type RemixNode } from 'remix/ui'

import { createCanvas, draw, fitImage } from './canvas.ts'
import type { Region } from './types.ts'

// Theme colors inlined — see `controller.tsx` for the rationale (assets are
// outside the `app/ui/theme.ts` allow list).
const LIGHT_500 = '#f1eee4'
const PRIMARY_500 = '#f7a1c4'
const DARK_500 = '#1c0f13'

export interface StageReviewProps {
  image: HTMLImageElement
  imageData: ImageData
  regions: Region[]
  selectedId: string | null
  setRegions: (regions: Region[]) => void
  setSelectedId: (id: string | null) => void
  goNext: () => void
  goBack: () => void
}

interface View {
  scale: number
  x: number
  y: number
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Review-stage component. Owns the `<canvas>` DOM node, fits the image on
 * mount, wires the pointer/wheel handlers from `canvas.ts`, and runs detection
 * via the dynamically-imported `detect.ts` module.
 *
 * View state (zoom + pan) is component-local and lives in a closure variable;
 * regions and selection are kept in the parent because other stages (e.g.
 * "Adjust crop ↩" from the transparency stage) need to mutate them. The
 * pointer handlers call back into the parent via `setRegions` / `setSelectedId`
 * whenever those change.
 */
export function StageReview(handle: Handle<StageReviewProps>): () => RemixNode {
  // Closure-local view state. Doesn't need to round-trip through the parent.
  let view: View = { scale: 1, x: 0, y: 0 }
  let status = 'Click "Detect" to find stickers, or add regions manually.'
  let canvasEl: HTMLCanvasElement | null = null
  let fitted = false

  /**
   * Snapshot the parent props + local view into the `CanvasState` the
   * `canvas.ts` handlers want. Called on every pointer event and redraw.
   */
  function getState(): {
    image: HTMLImageElement
    regions: Region[]
    selectedId: string | null
    view: View
  } {
    return {
      image: handle.props.image,
      regions: handle.props.regions,
      selectedId: handle.props.selectedId,
      view,
    }
  }

  /**
   * Apply a partial state change. View changes stay local; region/selection
   * changes bubble up to the parent (and we re-render either way).
   */
  function patch(changes: {
    regions?: Region[]
    selectedId?: string | null
    view?: View
  }): void {
    if (changes.view) view = changes.view
    if (changes.regions) handle.props.setRegions(changes.regions)
    if (changes.selectedId !== undefined) handle.props.setSelectedId(changes.selectedId)
    // `handle.update()` will paint on the next tick; the queued task in the
    // render function calls `redraw()` once props are fresh. If only the
    // (local) view changed, props are already fresh, but the queued task
    // still gives us a single consistent redraw path.
    handle.update()
  }

  function redraw(): void {
    if (!canvasEl) return
    resizeBuffer(canvasEl)
    const ctx = canvasEl.getContext('2d')
    if (!ctx) return
    draw(ctx, getState())
  }

  /**
   * Match the canvas backing buffer to the CSS size at the current devicePixelRatio.
   * Keep the transform set so all draw operations work in CSS-pixel space.
   */
  function resizeBuffer(canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /**
   * Mount-side wiring: register pointer/wheel/keydown listeners and a
   * resize observer. Everything uses `handle.signal` for teardown so we
   * never leak past component disconnect.
   */
  function onCanvasMount(node: Element, signal: AbortSignal): void {
    if (!(node instanceof HTMLCanvasElement)) return
    canvasEl = node

    const handlers = createCanvas(node, getState, patch)

    node.addEventListener('pointerdown', handlers.onPointerDown, { signal })
    node.addEventListener('pointermove', handlers.onPointerMove, { signal })
    node.addEventListener('pointerup', handlers.onPointerUp, { signal })
    node.addEventListener('pointercancel', handlers.onPointerUp, { signal })
    node.addEventListener('wheel', handlers.onWheel, { signal, passive: false })

    // Resize observer so the canvas keeps fitting its container when the
    // window changes.
    const ro = new ResizeObserver(() => {
      redraw()
    })
    ro.observe(node)
    signal.addEventListener('abort', () => ro.disconnect())

    // Document-level keydown for Delete/Backspace. Bound here, scoped to the
    // mount lifetime so it doesn't survive stage transitions.
    document.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return
        // Ignore when focused in a form field.
        const t = e.target
        if (t instanceof HTMLElement) {
          const tag = t.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return
        }
        if (!handle.props.selectedId) return
        e.preventDefault()
        deleteSelected()
      },
      { signal },
    )

    // First-time fit. Wait one frame so the layout has settled before
    // measuring the bounding rect.
    requestAnimationFrame(() => {
      if (!canvasEl) return
      if (!fitted) {
        view = fitImage(canvasEl, handle.props.image)
        fitted = true
      }
      redraw()
    })

    canvasEl = node
  }

  /**
   * Lazy-load `detect.ts` and run detection on the source ImageData. Yields
   * to the browser between stages so the "Loading detector…" / "Detecting…"
   * status strings actually paint before the synchronous detection runs.
   */
  async function onDetect(): Promise<void> {
    setStatus('Loading detector…')
    await nextFrame()
    const { detectRegions } = await import('./detect.ts')
    setStatus('Detecting stickers…')
    await nextFrame()
    let result: Region[] = []
    try {
      result = detectRegions(handle.props.imageData)
    } catch (error) {
      setStatus(`Detection failed: ${String(error)}`)
      return
    }
    handle.props.setRegions(result)
    handle.props.setSelectedId(result[0]?.id ?? null)
    setStatus(
      result.length === 0
        ? 'No stickers detected. Add regions manually, or try a clearer photo.'
        : `Found ${result.length} sticker${result.length === 1 ? '' : 's'}. Review, then continue.`,
    )
  }

  function onAdd(): void {
    const image = handle.props.image
    const iw = image.naturalWidth || image.width
    const ih = image.naturalHeight || image.height
    const w = Math.round(iw * 0.18)
    const h = Math.round(ih * 0.18)
    const region: Region = {
      id: genId(),
      x: Math.round((iw - w) / 2),
      y: Math.round((ih - h) / 2),
      width: w,
      height: h,
      score: 1,
    }
    handle.props.setRegions([...handle.props.regions, region])
    handle.props.setSelectedId(region.id)
    setStatus('Added region. Drag to position, or use corner handles to resize.')
  }

  function deleteSelected(): void {
    const id = handle.props.selectedId
    if (!id) return
    const next = handle.props.regions.filter((r) => r.id !== id)
    handle.props.setRegions(next)
    handle.props.setSelectedId(null)
    setStatus(`Deleted region. ${next.length} remaining.`)
  }

  function onResetZoom(): void {
    if (!canvasEl) return
    view = fitImage(canvasEl, handle.props.image)
    handle.update()
  }

  function setStatus(s: string): void {
    status = s
    handle.update()
  }

  return () => {
    const { regions, selectedId } = handle.props
    const canDelete = selectedId !== null
    const canContinue = regions.length > 0

    // Queue a redraw after this render completes. Props don't update until
    // the render commits, so synchronous `redraw()` calls inside handlers
    // (e.g. onDetect → setRegions → redraw) would paint with stale state.
    // Queuing here makes every state change consistent.
    handle.queueTask(() => redraw())

    return (
      <div mix={rootStyle}>
        <div mix={toolbarStyle}>
          <button type="button" mix={[btnStyle, on('click', onDetect)]}>
            Detect
          </button>
          <button type="button" mix={[btnStyle, on('click', onAdd)]}>
            Add region
          </button>
          <button
            type="button"
            mix={[btnStyle, on('click', deleteSelected)]}
            disabled={!canDelete}
          >
            Delete selected
          </button>
          <button type="button" mix={[btnStyle, on('click', onResetZoom)]}>
            Reset zoom
          </button>
          <span mix={spacerStyle} />
          <button type="button" mix={[btnStyle, on('click', () => handle.props.goBack())]}>
            ← Back
          </button>
          <button
            type="button"
            mix={[primaryBtnStyle, on('click', () => handle.props.goNext())]}
            disabled={!canContinue}
          >
            Next: review backgrounds →
          </button>
        </div>
        <div mix={canvasWrapStyle}>
          <canvas mix={[canvasStyle, ref(onCanvasMount)]} />
        </div>
        <p mix={statusStyle}>
          {status} <span mix={countStyle}>{regions.length} region{regions.length === 1 ? '' : 's'}</span>
        </p>
      </div>
    )
  }
}

const rootStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
})

const toolbarStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  alignItems: 'center',
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

const canvasWrapStyle = css({
  width: '100%',
  // The aspect ratio is roughly that of phone-camera output; clamped by the
  // page container's max-width. Switch to flex-1 once the page lives inside
  // a true viewport-height shell.
  height: 'min(70vh, 700px)',
  background: '#0e0709',
  border: `1px solid ${LIGHT_500}33`,
  borderRadius: '0.25rem',
  overflow: 'hidden',
})

const canvasStyle = css({
  display: 'block',
  width: '100%',
  height: '100%',
  touchAction: 'none',
  cursor: 'crosshair',
})

const statusStyle = css({
  margin: 0,
  fontSize: '0.875rem',
  opacity: 0.85,
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
})

const countStyle = css({
  marginLeft: 'auto',
  opacity: 0.65,
  fontVariantNumeric: 'tabular-nums',
})
