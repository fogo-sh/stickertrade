/**
 * Background-removal pipeline for the batch sticker upload flow.
 *
 * Two layers live in this module:
 *   1. Pure pixel helpers (`applyAlphaMask`, `trimTransparentAndPad`,
 *      `tensorToAlphaMask`, `imageDataToPngBlob`). These are unit-tested
 *      from `test/transparency-helpers.test.ts` — they don't touch
 *      `@huggingface/transformers` or the network. The first three are
 *      pure JS and run anywhere; the last one needs a `Canvas` API so
 *      it's effectively browser-only.
 *   2. ML wrappers (`loadTransparencyEngine`, `removeBackground`) that
 *      lazy-import `@huggingface/transformers` and drive `Xenova/u2netp`.
 *      These are NOT unit-tested — they require a browser context plus
 *      network access to the Hugging Face CDN. Task 6's transparency
 *      stage UI is the first place they're exercised end-to-end.
 *
 * The dynamic-`import('@huggingface/transformers')` call is intentional.
 * It keeps the ~700 KB transformers.js runtime and its ~3.5 MB ONNX
 * Runtime WASM bundle out of the initial controller payload — they only
 *   load when the user actually enters the transparency stage.
 */

/**
 * Combine an RGB crop with a separately-computed alpha mask into a new
 * RGBA `ImageData`. RGB triples are copied verbatim from `crop`; the
 * alpha channel comes entirely from `alpha`.
 *
 * Throws if `alpha.length` doesn't match `crop.width * crop.height` —
 * a mismatch means the upstream resize step (`tensorToAlphaMask`) was
 * given the wrong destination dimensions and silently swallowing it
 * would produce a corrupt sticker.
 */
export function applyAlphaMask(
  crop: ImageData,
  alpha: Uint8ClampedArray,
): ImageData {
  const pixelCount = crop.width * crop.height
  if (alpha.length !== pixelCount) {
    throw new Error(
      `applyAlphaMask: alpha.length=${alpha.length} does not match ` +
        `crop ${crop.width}×${crop.height} (${pixelCount} pixels)`,
    )
  }
  const data = new Uint8ClampedArray(crop.data.length)
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4
    data[o] = crop.data[o]!
    data[o + 1] = crop.data[o + 1]!
    data[o + 2] = crop.data[o + 2]!
    data[o + 3] = alpha[i]!
  }
  return new ImageData(data, crop.width, crop.height)
}

/**
 * Crop the image down to the tight bounding box of its non-zero-alpha
 * pixels, then add a transparent border of `pad` pixels on every side.
 * Used to give u2netp output a small breathing-room border so the
 * sticker doesn't render flush against its frame.
 *
 * If every pixel is fully transparent, returns the original image
 * unchanged — the caller's downstream logic (or a future "stickier
 * threshold" knob) decides whether to drop or surface the empty result.
 */
export function trimTransparentAndPad(image: ImageData, pad: number): ImageData {
  const { data, width: w, height: h } = image

  // Find top: first row containing any non-zero alpha pixel.
  let top = -1
  outerTop: for (let y = 0; y < h; y++) {
    const rowStart = y * w * 4
    for (let x = 0; x < w; x++) {
      if (data[rowStart + x * 4 + 3]! !== 0) {
        top = y
        break outerTop
      }
    }
  }
  if (top === -1) {
    // Fully transparent — nothing to trim, return untouched.
    return image
  }

  let bottom = top
  outerBottom: for (let y = h - 1; y >= top; y--) {
    const rowStart = y * w * 4
    for (let x = 0; x < w; x++) {
      if (data[rowStart + x * 4 + 3]! !== 0) {
        bottom = y
        break outerBottom
      }
    }
  }

  let left = 0
  outerLeft: for (let x = 0; x < w; x++) {
    for (let y = top; y <= bottom; y++) {
      if (data[(y * w + x) * 4 + 3]! !== 0) {
        left = x
        break outerLeft
      }
    }
  }

  let right = left
  outerRight: for (let x = w - 1; x >= left; x--) {
    for (let y = top; y <= bottom; y++) {
      if (data[(y * w + x) * 4 + 3]! !== 0) {
        right = x
        break outerRight
      }
    }
  }

  const bboxW = right - left + 1
  const bboxH = bottom - top + 1
  const outW = bboxW + 2 * pad
  const outH = bboxH + 2 * pad
  const out = new Uint8ClampedArray(outW * outH * 4) // zero-initialised

  for (let y = 0; y < bboxH; y++) {
    const srcRow = (top + y) * w * 4
    const dstRow = (y + pad) * outW * 4
    for (let x = 0; x < bboxW; x++) {
      const srcIdx = srcRow + (left + x) * 4
      const dstIdx = dstRow + (x + pad) * 4
      out[dstIdx] = data[srcIdx]!
      out[dstIdx + 1] = data[srcIdx + 1]!
      out[dstIdx + 2] = data[srcIdx + 2]!
      out[dstIdx + 3] = data[srcIdx + 3]!
    }
  }

  return new ImageData(out, outW, outH)
}

/**
 * Bilinear-resample a float32 segmentation mask (e.g. u2netp's 320×320
 * output) up to the crop's pixel grid, returning a `Uint8ClampedArray`
 * of alpha bytes (0..255).
 *
 * Input values are expected in [0, 1]; values outside that range are
 * implicitly clamped by `Uint8ClampedArray`.
 */
export function tensorToAlphaMask(
  tensorData: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstW * dstH)
  if (dstW === 0 || dstH === 0) return out

  // Standard bilinear sampler: map output pixel centres to fractional
  // source coordinates, sample the four surrounding source pixels, blend.
  // `scaleX/Y` collapse to 0 when src dim is 1, which is fine — we just
  // sample the single available row/column.
  const scaleX = srcW > 1 ? (srcW - 1) / Math.max(1, dstW - 1) : 0
  const scaleY = srcH > 1 ? (srcH - 1) / Math.max(1, dstH - 1) : 0

  for (let y = 0; y < dstH; y++) {
    const fy = y * scaleY
    const y0 = Math.floor(fy)
    const y1 = Math.min(srcH - 1, y0 + 1)
    const wy = fy - y0
    for (let x = 0; x < dstW; x++) {
      const fx = x * scaleX
      const x0 = Math.floor(fx)
      const x1 = Math.min(srcW - 1, x0 + 1)
      const wx = fx - x0

      const v00 = tensorData[y0 * srcW + x0]!
      const v01 = tensorData[y0 * srcW + x1]!
      const v10 = tensorData[y1 * srcW + x0]!
      const v11 = tensorData[y1 * srcW + x1]!

      const top = v00 + (v01 - v00) * wx
      const bot = v10 + (v11 - v10) * wx
      const v = top + (bot - top) * wy

      out[y * dstW + x] = Math.round(v * 255)
    }
  }
  return out
}

/**
 * Encode an `ImageData` as a PNG `Blob`. Prefers `OffscreenCanvas` (no
 * DOM, available in dedicated workers); falls back to a temporary
 * `<canvas>` mounted briefly into `document.body` for ancient browsers
 * that lack OffscreenCanvas (e.g. Safari < 16.4).
 *
 * Not unit-tested: under `node:test` neither OffscreenCanvas nor a real
 * DOM canvas is available, and mocking both adds noise without
 * meaningful coverage. The pure-JS helpers above carry the test weight.
 */
export async function imageDataToPngBlob(image: ImageData): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(image.width, image.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('imageDataToPngBlob: no 2d context on OffscreenCanvas')
    ctx.putImageData(image, 0, 0)
    return canvas.convertToBlob({ type: 'image/png' })
  }

  if (typeof document === 'undefined') {
    throw new Error('imageDataToPngBlob: no OffscreenCanvas and no document available')
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  // Some browsers (looking at you, older Safari) need the canvas in the
  // DOM tree for toBlob to fire reliably. Detach in `finally`.
  canvas.style.position = 'fixed'
  canvas.style.left = '-9999px'
  document.body.appendChild(canvas)
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('imageDataToPngBlob: no 2d context on HTMLCanvasElement')
    ctx.putImageData(image, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png')
    })
    if (!blob) throw new Error('imageDataToPngBlob: toBlob returned null')
    return blob
  } finally {
    canvas.remove()
  }
}

// ---------------------------------------------------------------------------
// ML wrappers — browser-only, lazy-loaded.
// ---------------------------------------------------------------------------

/**
 * Module-level singletons for the loaded model and processor. We accept
 * `unknown` here because `@huggingface/transformers` types don't surface
 * `AutoModel.from_pretrained`'s return shape in a way that's useful at
 * this boundary, and the methods we call (`engine({...})`, the call-
 * signature on `processor`) need narrow `any` casts at the call site
 * anyway. Keep the variables `unknown` so accidental property access
 * trips the type checker.
 */
let engine: unknown = null
let processor: unknown = null
let loading: Promise<void> | null = null

export type ProgressCallback = (loaded: number, total: number, stage: string) => void

/**
 * Idempotently download + initialise the u2netp model and its image
 * processor. Concurrent calls share the same in-flight promise; the
 * second-and-later calls after `engine` is ready resolve immediately.
 *
 * `onProgress` is invoked while model shards stream in (status
 * `'progress'` from transformers.js). It is NOT invoked once or for
 * cached loads — wire a "Loading model…" status before calling and
 * clear it after `loadTransparencyEngine` resolves.
 */
export async function loadTransparencyEngine(
  onProgress?: ProgressCallback,
): Promise<void> {
  if (engine) return
  if (loading) return loading
  loading = (async () => {
    // Dynamic import keeps the ~700 KB transformers.js bundle out of the
    // initial controller payload. See module header.
    const tjs = await import('@huggingface/transformers')
    tjs.env.allowRemoteModels = true
    tjs.env.useBrowserCache = true

    // Model selection: the plan named `Xenova/u2netp`, but that namespace
    // currently returns 401 on the HF CDN. The `BritishWerewolf/U-2-Netp`
    // re-host loads but ships a `U2NetImageProcessor` that transformers.js
    // doesn't recognise. `briaai/RMBG-1.4` is what the upstream
    // transformers.js remove-background demo uses
    // (https://github.com/huggingface/transformers.js-examples/tree/main/remove-background-webgpu);
    // it's a standard `ImageFeatureExtractor` + ONNX segmentation model
    // with the same `[1,1,H,W]` output shape we already handle, just at
    // 1024×1024 instead of u2netp's 320×320. The bilinear upsampler in
    // `tensorToAlphaMask` doesn't care about the source resolution.
    const modelId = 'briaai/RMBG-1.4'
    engine = await tjs.AutoModel.from_pretrained(modelId, {
      device: pickDevice(),
      progress_callback: (p: { status?: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && onProgress) {
          onProgress(p.loaded ?? 0, p.total ?? 0, 'model')
        }
      },
    })
    processor = await tjs.AutoProcessor.from_pretrained(modelId)
  })()
  try {
    await loading
  } catch (error) {
    // Clear the singleton so a retry can re-attempt the download
    // instead of getting wedged on a rejected promise.
    loading = null
    throw error
  }
}

function pickDevice(): 'webgpu' | 'wasm' {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) return 'webgpu'
  return 'wasm'
}

export interface TransparencyResult {
  pngBlob: Blob
  width: number
  height: number
}

/**
 * Run u2netp on a single sticker crop and return a transparent PNG.
 *
 * The model output shape is `[1, 1, 320, 320]` with values in [0, 1].
 * We bilinear-upsample to the crop dimensions, apply as alpha, trim
 * fully-transparent borders, pad 8 px, then PNG-encode.
 *
 * Per the design spec, the caller is the transparency-stage UI; on
 * inference failure for one crop the caller should surface the error
 * on that card and continue with the rest.
 */
export async function removeBackground(crop: ImageData): Promise<TransparencyResult> {
  if (!engine || !processor) {
    throw new Error('removeBackground: engine not loaded — call loadTransparencyEngine first')
  }
  const tjs = await import('@huggingface/transformers')

  // RawImage accepts RGB or RGBA pixel buffers; we pass 4 channels and
  // let u2netp's processor handle the conversion to its expected input.
  const rawImage = new tjs.RawImage(crop.data, crop.width, crop.height, 4)
  // Both `processor(rawImage)` and `engine({ input: pixel_values })` are
  // dynamically-typed at the JS layer; transformers.js doesn't expose
  // useful TS types for the call signatures. Narrow casts here.
  const processed = await (processor as (img: unknown) => Promise<{ pixel_values: unknown }>)(rawImage)
  const output = await (engine as (inputs: { input: unknown }) => Promise<Record<string, { data: Float32Array; dims: number[] }>>)({
    input: processed.pixel_values,
  })

  // u2netp's output tensor key in v3+ transformers.js is `output`. If
  // that ever changes we fall back to the first tensor value so the
  // page doesn't hard-crash with a misleading "engine not loaded" trace
  // — Task 6's UI will surface the actual failure.
  const tensor = output.output ?? Object.values(output)[0]
  if (!tensor) {
    throw new Error('removeBackground: model returned no output tensor')
  }
  const { data, dims } = tensor
  const tw = dims[dims.length - 1]!
  const th = dims[dims.length - 2]!

  const alpha = tensorToAlphaMask(data, tw, th, crop.width, crop.height)
  const rgba = applyAlphaMask(crop, alpha)
  const trimmed = trimTransparentAndPad(rgba, 8)
  const pngBlob = await imageDataToPngBlob(trimmed)
  return { pngBlob, width: trimmed.width, height: trimmed.height }
}
