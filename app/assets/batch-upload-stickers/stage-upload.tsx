import { css, on, ref, type Handle, type RemixNode } from 'remix/ui'

import type { SourceImage } from './types.ts'

// Theme colors inlined — `app/ui/theme.ts` is outside the asset server's
// allow list. Hex values match the `light.500`, `primary.500`, and
// `dark.500` tokens.
const LIGHT_500 = '#f1eee4'
const PRIMARY_500 = '#f7a1c4'
const DARK_500 = '#1c0f13'

const ACCEPTED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
])
const ACCEPT_ATTR = 'image/png,image/jpeg,image/webp,image/heic,image/heif'
const MAX_FILE_BYTES = 10 * 1024 * 1024

export interface StageUploadProps {
  onLoaded: (source: SourceImage) => void
  /** Optional dev affordance: show the synthetic-test-image button. */
  showTestImageButton?: boolean
  /** Invoked when the user clicks the synthetic test image button. */
  onUseTestImage?: () => void
  /** Surfaced error from the synthetic flow, rendered alongside picker errors. */
  testImageError?: string | null
}

type Status =
  | { kind: 'idle' }
  | { kind: 'decoding'; name: string }
  | { kind: 'error'; message: string }

/**
 * Upload-stage component. Owns the drop zone, the hidden file input, the
 * file-validation pipeline, and the image-decoding pipeline. On success it
 * hands a fully-decoded `SourceImage` back to the parent via `onLoaded`,
 * which is responsible for transitioning to the review stage.
 *
 * Decoding strategy:
 *   1. `createImageBitmap(file, { imageOrientation: 'from-image' })` —
 *      fastest, respects EXIF orientation.
 *   2. Fallback to `new Image() + URL.createObjectURL(file)` for browsers
 *      where `createImageBitmap` doesn't support the source type (e.g.
 *      Safari + HEIC) or doesn't accept the orientation option.
 *
 * The resulting bitmap/image is drawn to an `OffscreenCanvas` (or a normal
 * `<canvas>` if OffscreenCanvas is unavailable) so we can extract
 * `ImageData` for the detector.
 */
export function StageUpload(handle: Handle<StageUploadProps>): () => RemixNode {
  let status: Status = { kind: 'idle' }
  let isDragging = false
  let fileInput: HTMLInputElement | null = null

  function setStatus(next: Status): void {
    status = next
    handle.update()
  }

  function setDragging(next: boolean): void {
    if (isDragging === next) return
    isDragging = next
    handle.update()
  }

  function validateFile(file: File): string | null {
    if (file.size === 0) return 'file is empty'
    if (file.size > MAX_FILE_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1)
      return `file is ${mb} MB; max is 10 MB`
    }
    // Some browsers leave .heic uploads with an empty MIME type. Fall back
    // to a filename-extension check so HEIC still gets through.
    const mime = (file.type || '').toLowerCase()
    if (mime) {
      if (!ACCEPTED_MIME_TYPES.has(mime)) {
        return `unsupported format "${file.type}" — use jpg, png, webp, or heic`
      }
      return null
    }
    const name = file.name.toLowerCase()
    if (
      name.endsWith('.png') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.webp') ||
      name.endsWith('.heic') ||
      name.endsWith('.heif')
    ) {
      return null
    }
    return 'unsupported format — use jpg, png, webp, or heic'
  }

  /**
   * Decode a `File` into an HTMLImageElement we can draw to a canvas.
   * Tries `createImageBitmap` first (fast, EXIF-aware), then falls back
   * to `new Image() + URL.createObjectURL`.
   */
  async function decodeFile(
    file: File,
  ): Promise<{ image: HTMLImageElement; width: number; height: number }> {
    let bitmap: ImageBitmap | null = null
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      } catch {
        // Safari < 17 doesn't accept `imageOrientation`; try without it.
        try {
          bitmap = await createImageBitmap(file)
        } catch {
          bitmap = null
        }
      }
    }
    if (bitmap) {
      const w = bitmap.width
      const h = bitmap.height
      // Route the bitmap through a canvas so we end up with an
      // HTMLImageElement (which the review canvas wants for drawImage).
      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      const ctx = off.getContext('2d')
      if (!ctx) throw new Error('2d canvas context not available')
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close?.()
      const image = await canvasToImage(off)
      return { image, width: w, height: h }
    }
    // Fallback path: object URL + <img>.
    const url = URL.createObjectURL(file)
    try {
      const image = await loadImageFromUrl(url)
      return {
        image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      }
    } finally {
      // Defer revoke: the HTMLImageElement still references the URL for
      // its lifetime, but we let the browser GC handle it. We could keep
      // the URL alive until the image is drawn to the canvas; the
      // canvas-blob roundtrip in `canvasToImage` would handle that, but
      // we skipped it here because the original blob URL is fine.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }
  }

  function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = url
    })
  }

  /**
   * Convert a `<canvas>` to a fresh `HTMLImageElement`. We need an image
   * for the review canvas because `canvas.ts` uses `drawImage(image, …)`
   * and treats it as the source-of-truth across stages.
   */
  async function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    )
    if (!blob) throw new Error('canvas.toBlob returned null')
    const url = URL.createObjectURL(blob)
    const image = await loadImageFromUrl(url)
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return image
  }

  /**
   * Render an HTMLImageElement to an OffscreenCanvas (or fall back to a
   * regular canvas) and pull `ImageData` out for the detector.
   */
  function extractImageData(
    image: HTMLImageElement,
    width: number,
    height: number,
  ): ImageData {
    if (typeof OffscreenCanvas !== 'undefined') {
      const off = new OffscreenCanvas(width, height)
      const ctx = off.getContext('2d')
      if (!ctx) throw new Error('offscreen 2d context not available')
      ctx.drawImage(image, 0, 0)
      return ctx.getImageData(0, 0, width, height)
    }
    const off = document.createElement('canvas')
    off.width = width
    off.height = height
    const ctx = off.getContext('2d')
    if (!ctx) throw new Error('2d canvas context not available')
    ctx.drawImage(image, 0, 0)
    return ctx.getImageData(0, 0, width, height)
  }

  async function processFile(file: File): Promise<void> {
    const err = validateFile(file)
    if (err) {
      setStatus({ kind: 'error', message: err })
      return
    }
    setStatus({ kind: 'decoding', name: file.name })
    try {
      const { image, width, height } = await decodeFile(file)
      const imageData = extractImageData(image, width, height)
      handle.props.onLoaded({ image, imageData, width, height })
      // Leave status as 'decoding' — the parent will swap us out of view
      // by transitioning to the review stage. Resetting here would just
      // briefly flash 'idle' before unmount.
    } catch (error) {
      setStatus({ kind: 'error', message: `decode failed: ${String(error)}` })
    }
  }

  function onInputMount(node: Element, signal: AbortSignal): void {
    if (!(node instanceof HTMLInputElement)) return
    fileInput = node
    node.addEventListener(
      'change',
      (e: Event) => {
        const target = e.target
        if (!(target instanceof HTMLInputElement)) return
        const file = target.files?.[0]
        if (!file) return
        void processFile(file)
        // Reset so picking the same file again re-fires `change`.
        target.value = ''
      },
      { signal },
    )
  }

  function openPicker(): void {
    fileInput?.click()
  }

  /**
   * Wire drag/drop/keydown on the drop zone via a ref + addEventListener.
   * The `on(...)` mixin types the target as `Element`, which doesn't carry
   * `dragover`/`drop`/`keydown` in its EventMap — addEventListener bypasses
   * that and is also what the canvas does in `stage-review.tsx`.
   */
  function onZoneMount(node: Element, signal: AbortSignal): void {
    if (!(node instanceof HTMLElement)) return

    node.addEventListener(
      'click',
      (e: MouseEvent) => {
        // Don't re-open the picker when the user clicks the inner
        // <button>/<input> — those bubble up to here too.
        const target = e.target
        if (target instanceof HTMLElement && target.closest('button, input, a')) return
        openPicker()
      },
      { signal },
    )

    node.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openPicker()
        }
      },
      { signal },
    )

    node.addEventListener(
      'dragover',
      (e: DragEvent) => {
        // Required for `drop` to fire.
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      },
      { signal },
    )

    node.addEventListener(
      'dragleave',
      () => setDragging(false),
      { signal },
    )

    node.addEventListener(
      'drop',
      (e: DragEvent) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer?.files?.[0]
        if (!file) return
        void processFile(file)
      },
      { signal },
    )
  }

  return () => {
    const showTestButton = handle.props.showTestImageButton ?? false
    const testErr = handle.props.testImageError ?? null
    const decoding = status.kind === 'decoding'
    const pickerError = status.kind === 'error' ? status.message : null

    return (
      <div mix={rootStyle}>
        <div
          role="button"
          tabIndex={0}
          aria-label="upload a photo of your stickers"
          mix={[zoneStyle, isDragging ? zoneActiveStyle : null, ref(onZoneMount)]}
        >
          <p mix={headlineStyle}>drag &amp; drop a photo, or click to browse</p>
          <p mix={blurbStyle}>
            upload one photo of multiple stickers laid out on a flat surface.
            we&rsquo;ll detect each sticker, remove backgrounds, and let you
            review before uploading them all.
          </p>
          <button
            type="button"
            mix={[primaryBtnStyle, on('click', openPicker)]}
            disabled={decoding}
          >
            {decoding ? 'decoding…' : 'choose photo'}
          </button>
          <input
            type="file"
            accept={ACCEPT_ATTR}
            mix={[hiddenInputStyle, ref(onInputMount)]}
          />
          <p mix={hintStyle}>jpg, png, webp, or heic · up to 10 MB</p>
        </div>
        {decoding ? (
          <p mix={statusStyle}>
            decoding {status.kind === 'decoding' ? status.name : ''}…
          </p>
        ) : null}
        {pickerError ? <p mix={errorStyle}>{pickerError}</p> : null}
        {showTestButton ? (
          // Try-it-with-our-fixture affordance: loads
          // `/images/test-stickers.jpg` (a real photo of three stickers)
          // so first-time visitors can see the flow without committing
          // their own image. Silently falls back to synthetic geometry
          // if the fixture is missing — see `onUseTestImage` in
          // controller.tsx.
          <div mix={devRowStyle}>
            <button
              type="button"
              mix={[ghostBtnStyle, on('click', () => handle.props.onUseTestImage?.())]}
            >
              try with sample photo
            </button>
            {testErr ? <p mix={errorStyle}>{testErr}</p> : null}
          </div>
        ) : null}
        <noscript>
          <p mix={noscriptStyle}>
            this page needs JavaScript. use the regular{' '}
            <a href="/upload-sticker">single sticker upload</a> instead.
          </p>
        </noscript>
      </div>
    )
  }
}

const rootStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
})

const zoneStyle = css({
  padding: '2.5rem 1.5rem',
  border: `2px dashed ${LIGHT_500}66`,
  borderRadius: '0.5rem',
  background: 'transparent',
  color: LIGHT_500,
  textAlign: 'center',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.75rem',
  transition: 'border-color 120ms ease, background 120ms ease',
  '&:hover': { borderColor: PRIMARY_500 },
  '&:focus-visible': { outline: `2px solid ${PRIMARY_500}`, outlineOffset: '2px' },
})

const zoneActiveStyle = css({
  borderColor: PRIMARY_500,
  background: `${PRIMARY_500}14`,
})

const headlineStyle = css({
  margin: 0,
  fontSize: '1rem',
  fontWeight: 600,
})

const blurbStyle = css({
  margin: 0,
  maxWidth: '34rem',
  fontSize: '0.875rem',
  opacity: 0.8,
  lineHeight: 1.5,
})

const hintStyle = css({
  margin: 0,
  fontSize: '0.75rem',
  opacity: 0.6,
})

const statusStyle = css({
  margin: 0,
  fontSize: '0.875rem',
  opacity: 0.85,
})

const errorStyle = css({
  margin: 0,
  color: PRIMARY_500,
  fontSize: '0.875rem',
})

const hiddenInputStyle = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
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

const ghostBtnStyle = css({
  background: 'transparent',
  color: LIGHT_500,
  border: `1px solid ${LIGHT_500}44`,
  borderRadius: '0.25rem',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '0.75rem',
  padding: '0.25rem 0.5rem',
  opacity: 0.7,
  '&:hover': { borderColor: PRIMARY_500, opacity: 1 },
})

const devRowStyle = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '0.25rem',
  marginTop: '0.25rem',
})

const noscriptStyle = css({ opacity: 0.8, fontSize: '0.875rem' })
