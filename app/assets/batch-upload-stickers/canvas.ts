import type { Region } from './types.ts'

/**
 * Pure pixel + pointer logic for the review canvas. Faithful port of the
 * pointer/zoom/hit-test behaviour from `tmp/sticker-catalog/app/static/app.js`,
 * adapted to a "return handlers, don't attach" lifecycle so the Remix 3
 * component owns event registration.
 *
 * Theme colors inlined (asset server's allow list excludes `app/ui/theme.ts`).
 * Hex values match `light.500` and `primary.500` tokens. Match `app/ui/theme.ts`.
 */
const LIGHT_500 = '#f1eee4'
const PRIMARY_500 = '#f7a1c4'

/** Minimum bbox dimension in image-space pixels (mirrors the Python tool). */
const MIN_REGION_DIM = 12

/** Hit slop for corner handles, in *screen* pixels. */
const HANDLE_HIT_PX = 10

/** Drawn handle size, in *screen* pixels. */
const HANDLE_DRAW_PX = 8

/** Zoom bounds. */
const MIN_ZOOM = 0.03
const MAX_ZOOM = 8

export interface CanvasState {
  image: HTMLImageElement
  regions: Region[]
  selectedId: string | null
  view: { scale: number; x: number; y: number }
}

/**
 * The subset of `CanvasState` that pointer/wheel handlers can patch. The
 * source image is owned by the controller and never changes mid-stage, so
 * we explicitly exclude it from the patch surface — accidentally swapping
 * the image during a pan or resize would corrupt the canvas.
 */
export type CanvasPatch = Partial<Pick<CanvasState, 'regions' | 'selectedId' | 'view'>>

export interface CanvasHandlers {
  onPointerDown(e: PointerEvent): void
  onPointerMove(e: PointerEvent): void
  onPointerUp(e: PointerEvent): void
  onWheel(e: WheelEvent): void
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

type Drag =
  | { mode: 'pan'; startSx: number; startSy: number; original: { x: number; y: number } }
  | {
      mode: 'move'
      regionId: string
      startIx: number
      startIy: number
      original: { x: number; y: number; width: number; height: number }
    }
  | {
      mode: 'resize'
      regionId: string
      handle: ResizeHandle
      startIx: number
      startIy: number
      original: { x: number; y: number; width: number; height: number }
    }

/**
 * Convert a screen-pixel point (relative to the canvas's CSS box) into an
 * image-space point given the current view.
 */
export function screenToImage(
  _canvas: HTMLCanvasElement,
  view: CanvasState['view'],
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale }
}

function imageToScreen(view: CanvasState['view'], ix: number, iy: number): { x: number; y: number } {
  return { x: view.x + ix * view.scale, y: view.y + iy * view.scale }
}

/**
 * Compute a centered, slightly-padded fit-to-canvas view for an image. The
 * 0.92 factor mirrors the Python tool so the image doesn't kiss the edges.
 */
export function fitImage(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
): { scale: number; x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const iw = image.naturalWidth || image.width
  const ih = image.naturalHeight || image.height
  if (iw <= 0 || ih <= 0 || rect.width <= 0 || rect.height <= 0) {
    return { scale: 1, x: 0, y: 0 }
  }
  const scale = Math.max(MIN_ZOOM, Math.min(rect.width / iw, rect.height / ih) * 0.92)
  const x = (rect.width - iw * scale) / 2
  const y = (rect.height - ih * scale) / 2
  return { scale, x, y }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Find the topmost region (or corner handle) under a point in image-space.
 * Iterates in reverse so later-added regions take priority.
 */
function hitTest(
  state: CanvasState,
  point: { x: number; y: number },
): { region: Region; mode: 'move' } | { region: Region; mode: 'resize'; handle: ResizeHandle } | null {
  const handleSlopImg = HANDLE_HIT_PX / state.view.scale
  for (let i = state.regions.length - 1; i >= 0; i--) {
    const r = state.regions[i]!
    const corners: Array<[ResizeHandle, number, number]> = [
      ['nw', r.x, r.y],
      ['ne', r.x + r.width, r.y],
      ['sw', r.x, r.y + r.height],
      ['se', r.x + r.width, r.y + r.height],
    ]
    for (const [handle, hx, hy] of corners) {
      if (Math.abs(point.x - hx) <= handleSlopImg && Math.abs(point.y - hy) <= handleSlopImg) {
        return { region: r, mode: 'resize', handle }
      }
    }
    if (
      point.x >= r.x &&
      point.x <= r.x + r.width &&
      point.y >= r.y &&
      point.y <= r.y + r.height
    ) {
      return { region: r, mode: 'move' }
    }
  }
  return null
}

/**
 * Compute new bbox for a resize drag. Mirrors the Python tool's `resizeRegion`:
 * each handle pins two adjacent edges and moves the other two by the cursor
 * delta. Final bbox is clamped to image bounds with a minimum dimension of
 * `MIN_REGION_DIM`.
 */
function resizeBbox(
  original: { x: number; y: number; width: number; height: number },
  dx: number,
  dy: number,
  handle: ResizeHandle,
  imgW: number,
  imgH: number,
): { x: number; y: number; width: number; height: number } {
  let x1 = original.x
  let y1 = original.y
  let x2 = original.x + original.width
  let y2 = original.y + original.height
  if (handle === 'nw' || handle === 'sw') x1 = original.x + dx
  if (handle === 'ne' || handle === 'se') x2 = original.x + original.width + dx
  if (handle === 'nw' || handle === 'ne') y1 = original.y + dy
  if (handle === 'sw' || handle === 'se') y2 = original.y + original.height + dy
  x1 = clamp(Math.round(x1), 0, imgW - MIN_REGION_DIM)
  y1 = clamp(Math.round(y1), 0, imgH - MIN_REGION_DIM)
  x2 = clamp(Math.round(x2), x1 + MIN_REGION_DIM, imgW)
  y2 = clamp(Math.round(y2), y1 + MIN_REGION_DIM, imgH)
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/**
 * Read the pointer event's coordinates relative to the canvas's CSS box.
 * We can't trust `event.offsetX/Y` cross-browser when the canvas has CSS
 * transforms; getBoundingClientRect-based math is safer.
 */
function pointerCoords(canvas: HTMLCanvasElement, e: PointerEvent | WheelEvent): { sx: number; sy: number } {
  const rect = canvas.getBoundingClientRect()
  return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
}

/**
 * Build the pointer/wheel handler set. The component is expected to attach
 * these to the canvas (or document, for `pointerup`) and detach them via the
 * supplied AbortSignal.
 */
export function createCanvas(
  canvas: HTMLCanvasElement,
  getState: () => CanvasState,
  patch: (changes: CanvasPatch) => void,
): CanvasHandlers {
  let drag: Drag | null = null

  function onPointerDown(e: PointerEvent): void {
    const state = getState()
    const { sx, sy } = pointerCoords(canvas, e)
    const ip = screenToImage(canvas, state.view, sx, sy)
    const hit = hitTest(state, ip)

    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {
      // Some test environments / older browsers don't support capture; safe
      // to ignore — pointermove will still fire while the button is held.
    }

    if (hit) {
      if (hit.mode === 'resize') {
        drag = {
          mode: 'resize',
          regionId: hit.region.id,
          handle: hit.handle,
          startIx: ip.x,
          startIy: ip.y,
          original: { x: hit.region.x, y: hit.region.y, width: hit.region.width, height: hit.region.height },
        }
      } else {
        drag = {
          mode: 'move',
          regionId: hit.region.id,
          startIx: ip.x,
          startIy: ip.y,
          original: { x: hit.region.x, y: hit.region.y, width: hit.region.width, height: hit.region.height },
        }
      }
      if (state.selectedId !== hit.region.id) {
        patch({ selectedId: hit.region.id })
      }
    } else {
      drag = { mode: 'pan', startSx: sx, startSy: sy, original: { x: state.view.x, y: state.view.y } }
      if (state.selectedId !== null) {
        patch({ selectedId: null })
      }
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag) return
    const state = getState()
    const { sx, sy } = pointerCoords(canvas, e)

    if (drag.mode === 'pan') {
      patch({
        view: {
          scale: state.view.scale,
          x: drag.original.x + (sx - drag.startSx),
          y: drag.original.y + (sy - drag.startSy),
        },
      })
      return
    }

    const ip = screenToImage(canvas, state.view, sx, sy)
    const dx = ip.x - drag.startIx
    const dy = ip.y - drag.startIy
    const imgW = state.image.naturalWidth || state.image.width
    const imgH = state.image.naturalHeight || state.image.height
    const regionId = drag.regionId

    let updated: { x: number; y: number; width: number; height: number }
    if (drag.mode === 'move') {
      const nx = clamp(Math.round(drag.original.x + dx), 0, imgW - drag.original.width)
      const ny = clamp(Math.round(drag.original.y + dy), 0, imgH - drag.original.height)
      updated = { x: nx, y: ny, width: drag.original.width, height: drag.original.height }
    } else {
      updated = resizeBbox(drag.original, dx, dy, drag.handle, imgW, imgH)
    }

    const nextRegions = state.regions.map((r) =>
      r.id === regionId ? { ...r, ...updated } : r,
    )
    patch({ regions: nextRegions })
  }

  function onPointerUp(e: PointerEvent): void {
    if (!drag) return
    drag = null
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      // Capture may already be lost; not an error.
    }
  }

  function onWheel(e: WheelEvent): void {
    const state = getState()
    e.preventDefault()
    const { sx, sy } = pointerCoords(canvas, e)
    const before = screenToImage(canvas, state.view, sx, sy)
    const factor = e.deltaY < 0 ? 1.08 : 0.92
    const nextScale = clamp(state.view.scale * factor, MIN_ZOOM, MAX_ZOOM)
    const nextView = { scale: nextScale, x: state.view.x, y: state.view.y }
    const after = imageToScreen(nextView, before.x, before.y)
    nextView.x += sx - after.x
    nextView.y += sy - after.y
    patch({ view: nextView })
  }

  return { onPointerDown, onPointerMove, onPointerUp, onWheel }
}

/**
 * Render one frame of the canvas: checkerboard backdrop, image at the current
 * view, and a stroked rectangle (plus corner handles when selected) per region.
 *
 * The caller is responsible for sizing the backing buffer (DPR-aware) and
 * setting the transform — we draw in CSS-pixel space.
 */
export function draw(ctx: CanvasRenderingContext2D, state: CanvasState): void {
  const canvas = ctx.canvas
  // We deliberately read the CSS size from the backing buffer / transform
  // assumptions made by the host: the host sets `ctx.setTransform(dpr,0,0,dpr,0,0)`
  // so `canvas.width / dpr` is the CSS width. But to keep `canvas.ts` agnostic
  // we read the bounding rect (the host's `<canvas>` has known CSS dimensions).
  const rect = canvas.getBoundingClientRect()
  const cssW = rect.width || canvas.width
  const cssH = rect.height || canvas.height

  // Checkerboard background — drawn under everything, including the area the
  // image doesn't cover. Two 12px squares per repeat.
  drawCheckerboard(ctx, cssW, cssH)

  // Image.
  const image = state.image
  const iw = image.naturalWidth || image.width
  const ih = image.naturalHeight || image.height
  if (iw > 0 && ih > 0) {
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, state.view.x, state.view.y, iw * state.view.scale, ih * state.view.scale)
  }

  // Regions.
  for (const region of state.regions) {
    const p = imageToScreen(state.view, region.x, region.y)
    const w = region.width * state.view.scale
    const h = region.height * state.view.scale
    const selected = region.id === state.selectedId

    // White contrast outline first (1px outside the colored stroke).
    ctx.lineWidth = 4
    ctx.strokeStyle = '#ffffff'
    ctx.strokeRect(p.x - 0.5, p.y - 0.5, w + 1, h + 1)

    // Colored stroke.
    ctx.lineWidth = 2
    ctx.strokeStyle = selected ? PRIMARY_500 : LIGHT_500
    ctx.strokeRect(p.x, p.y, w, h)

    if (selected) {
      drawHandle(ctx, p.x, p.y)
      drawHandle(ctx, p.x + w, p.y)
      drawHandle(ctx, p.x, p.y + h)
      drawHandle(ctx, p.x + w, p.y + h)
    }
  }
}

function drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const size = 12
  ctx.fillStyle = '#1a1115'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#241a1f'
  for (let y = 0; y < h; y += size) {
    for (let x = ((y / size) % 2) * size; x < w; x += size * 2) {
      ctx.fillRect(x, y, size, size)
    }
  }
}

function drawHandle(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const half = HANDLE_DRAW_PX / 2
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#1d2430'
  ctx.lineWidth = 1
  ctx.fillRect(cx - half, cy - half, HANDLE_DRAW_PX, HANDLE_DRAW_PX)
  ctx.strokeRect(cx - half, cy - half, HANDLE_DRAW_PX, HANDLE_DRAW_PX)
}
