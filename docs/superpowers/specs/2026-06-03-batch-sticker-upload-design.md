# Batch Sticker Upload Design

**Status:** Approved, ready for implementation plan
**Date:** 2026-06-03

## Goal

A new `/upload-stickers/batch` page that lets a user upload one overhead photo of multiple stickers laid out on a flat surface and end up with N individual sticker rows in the database, each with a transparent-PNG image. All image processing happens in the browser — detection (pure JS), background removal (transformers.js + u2netp). Only the final per-sticker uploads hit the server, reusing the existing `POST /api/stickers` endpoint.

Inspired by `tmp/sticker-catalog/` (a Python FastAPI + OpenCV + rembg tool by a friend). We're porting the *algorithm* to the browser and integrating with stickertrade's existing single-upload pipeline.

## Scope

### In scope

- New page `/upload-stickers/batch`, auth-gated, linked from `/upload-sticker` (and vice versa)
- Four-stage client-side state machine: upload → review boxes → review transparency → finalize
- Pure-JS bounding-box detection (no OpenCV)
- Background removal via `@huggingface/transformers` + `Xenova/u2netp` (4.5 MB model, cached after first load)
- Canvas-based review UI: drag/resize/add/delete regions, pan/zoom
- Side-by-side transparency review (original crop vs transparent result) with keep/skip/adjust crop per sticker
- Sequential POST to the existing `/api/stickers` endpoint, one per approved sticker, with progress + per-sticker error handling
- Lazy module loading: each stage's code is dynamic-imported on entry; transformers.js + model defer to the transparency stage

### Out of scope

- No persistent server-side batch state — refresh = start over
- No batch upload endpoint on the server (sequential calls reuse single-create)
- No model selection UI (only `u2netp` in v1)
- No classic color-distance bg-removal fallback (no model → error path)
- No Web Worker for inference (defer until real perf complaint)
- No drag-and-drop reorder of boxes
- No per-region captions

## Routes

Single new route in `app/routes.ts`:

```ts
batchUploadStickers: '/upload-stickers/batch',
```

Server-side this is a GET-only page. The controller renders an `BatchUploadStickersPage` component with a single `clientEntry` mounted into the workspace area.

A small bidirectional link is added between `/upload-sticker` and `/upload-stickers/batch` so users can discover the feature.

## Client Architecture

All client code lives under `app/assets/batch-upload-stickers/`. The asset server's `allow` list already covers `app/assets/**`.

### Module map

| Module | Loaded | Approx LOC |
| --- | --- | --- |
| `controller.tsx` (clientEntry root, stage state machine) | eager | 200 |
| `stage-upload.tsx` (drop zone / picker) | eager | 60 |
| `detect.ts` (pure-JS bbox detector) | lazy on Detect click | 350 |
| `stage-review.tsx` + `canvas.ts` (canvas UI + interaction) | lazy on stage entry | 450 |
| `stage-transparency.tsx` (side-by-side review) | lazy on stage entry | 200 |
| `transparency.ts` (transformers.js wrapper) | lazy on first inference | 150 |
| `stage-finalize.tsx` (upload progress) | lazy on stage entry | 150 |
| `types.ts` (shared `Region`, stage enums, etc.) | eager | 40 |

**First-load cost**: ~10 KB of new code. `transformers.js` (~700 KB minified + ~3.5 MB WASM lazy) and `u2netp` model (~4.5 MB) defer to the transparency stage, cached after first load.

### State shape

The root controller owns this state:

```ts
type Stage = 'upload' | 'review' | 'transparency' | 'finalize'

interface BatchSession {
  stage: Stage
  source: {
    image: HTMLImageElement       // the user's photo, decoded
    imageData: ImageData          // for the detector (lazy-built)
    width: number                 // natural width
    height: number                // natural height
  } | null
  regions: Region[]
  selectedRegionId: string | null
  transparencyResults: Map<string, TransparencyResult> // region.id → result
  approvedRegionIds: Set<string>                       // user kept these
  skippedRegionIds: Set<string>                        // user discarded these
  uploadProgress: Map<string, UploadStatus>            // region.id → status
}

interface Region {
  id: string
  x: number; y: number; width: number; height: number
  score: number
}

interface TransparencyResult {
  pngBlob: Blob
  width: number
  height: number
}

type UploadStatus =
  | { state: 'pending' }
  | { state: 'uploading' }
  | { state: 'success', stickerSlug: string }
  | { state: 'error', message: string }
```

Stage transitions are gated by what each stage produces:

- `upload → review` requires a successfully decoded source image
- `review → transparency` requires `regions.length > 0`
- `transparency → finalize` requires `approvedRegionIds.size > 0`
- All stages can go backward via a "back" button

### Lazy loading pattern

```ts
// In controller.tsx
async function enterReviewStage() {
  // Render a "Loading…" placeholder
  setLoading(true)
  const [{ default: StageReview }] = await Promise.all([
    import('./stage-review.tsx'),
  ])
  registerStage('review', StageReview)
  setStage('review')
  setLoading(false)
}
```

Each stage module's default export is the component to mount. The controller caches loaded stages so re-entering doesn't re-import.

### CSRF

The browser uploads in `stage-finalize.tsx` hit `POST /api/stickers` which uses bearer or session+CSRF auth. Since we're inside a session-authenticated page, we use CSRF: include the CSRF token from a meta tag the page renders. Same pattern as the existing client entries (none yet exist, so we'll have to render the meta tag explicitly).

The CSRF token comes from `getCsrfToken(session)` server-side; rendered into the page as `<meta name="csrf-token" content="...">`. The client reads it via `document.querySelector('meta[name="csrf-token"]')`.

## Detection Algorithm (`detect.ts`)

Faithful TypeScript port of `tmp/sticker-catalog/app/vision.py`'s `_foreground_masks` + `_regions_from_mask` + `_merge_overlapping`. No external dependencies.

### Public API

```ts
export interface Region {
  id: string
  x: number; y: number; width: number; height: number
  score: number
}

export function detectRegions(imageData: ImageData): Region[]
```

Returns regions in source-image coordinates, sorted `(y, x)` ascending. Empty array if nothing detected.

### Pipeline

1. **Downscale to work size.** If `max(w, h) > 1600`, render via an `OffscreenCanvas` to a smaller image at scale `1600 / max(w, h)`. Detection runs on this. Scale factor is preserved for the final bbox scale-back.

2. **Convert RGB → LAB and HSV in pre-allocated typed arrays.**
   - `rgbToLab(r,g,b)`: sRGB linearize → XYZ (D65) → CIELAB. Inline formulas, no library.
   - `rgbToHsv(r,g,b)`: standard. Inline.
   - Outputs: `Float32Array` for L/A/B channels (3 separate), `Uint8Array` for H/S/V (3 separate).

3. **Border sampling.** Slice `border = max(8, min(w,h) / 30)` pixels from all four edges. Concatenate LAB samples and S samples. Compute median LAB color (per-channel median) and percentiles.

4. **Color mask.** For each pixel, LAB distance to background median. Threshold = `max(24, percentile96(borderLabDist) + 8)`. Output `Uint8Array` mask (0 / 255).

5. **Saturation mask.** Threshold S channel at `max(55, percentile96(borderS) + 24)`. OR with color mask.

6. **Median blur (3×3) + open (3×3) + close (9×9).** Pure-JS box-kernel morphology on `Uint8Array`. Each op is one or two sliding-window passes.

7. **Local contrast mask.** Grayscale (luma `0.299 R + 0.587 G + 0.114 B`). Box-blur approximation of Gaussian σ=25 (three passes of a box blur of radius ~15). Absolute diff against original gray, normalize to 0-255, threshold > 35. Open 3×3, close 13×13.

8. **Connected components (two-pass union-find) on each mask separately.** Output: `Uint32Array` of labels + `Map<label, BBox>`.

9. **Filter regions per mask.** Drop a bbox if:
   - Area < `max(900, 0.001 * mask_size)`
   - W < 32 or H < 32
   - Bbox area > 10% of mask
   - Aspect ratio < 0.12 or > 8.0
   - Fill ratio (area / bbox_area) < 0.08

10. **Pad each bbox by 4% of `max(w, h)`**, clamped.

11. **Scale all bboxes back to source coordinates** via the inverse of the downscale factor.

12. **Merge overlapping regions across both masks.** Union iteratively while any pair has overlap_area / smaller_area > 0.35. Output the union bbox, keeping the max score of the merged regions.

### Helper implementations

- **Percentile**: `Float64Array.prototype.sort` + linear interpolation.
- **Box blur**: separable horizontal then vertical pass, integer running sum.
- **Connected components (4-connectivity)**: first pass assigns provisional labels and records equivalences in a union-find DSU; second pass resolves labels and accumulates bbox per label.

### Performance budget

On a typical phone (800×600 working size after downscale):
- LAB+HSV: ~50ms
- Border sampling + thresholds: ~5ms
- Two binary masks + morph: ~60ms
- Grayscale + box-blur + contrast mask: ~80ms
- Connected components ×2: ~50ms
- Filter + pad + scale + merge: ~5ms

**Target: ≤300ms total on mid-range hardware.** Run inside a `setTimeout(_, 0)` so the UI can show "Detecting…" before the work starts.

### Edge cases

- Empty result (no contours pass filter) → return `[]`. UI shows "No stickers detected. Try adding boxes manually."
- All regions filter out as too large (one giant box covering the whole image) → return `[]`.
- Image smaller than 32×32 → return `[]`.

## Review Stage (`stage-review.tsx` + `canvas.ts`)

Faithful port of `tmp/sticker-catalog/app/static/app.js`'s canvas interaction, adapted to Remix 3's clientEntry model. The Python tool's `app.js` is ~500 lines of canvas + DOM manipulation; we end up close to that, split across two files.

### UI elements

- A `<canvas>` filling the workspace (max-width 1200px, aspect-ratio matching the source image)
- Toolbar: `Detect`, `Add`, `Delete selected`, `Reset zoom`
- Stage navigation: `← Back`, `Next: review backgrounds →`
- Counter: "N stickers detected"

### Canvas behaviors (port from `app.js`)

- **Pan**: pointer-down on empty area + drag
- **Zoom**: wheel event, anchored to pointer position
- **Select region**: pointer-down inside a region's bbox
- **Move region**: pointer-down inside + drag
- **Resize region**: pointer-down on a corner handle (8px hit area in screen px) + drag
- **Delete selected**: `Delete` or `Backspace` key, or toolbar button
- **Add region**: toolbar button inserts a centered 18%-of-image-area region
- **Detect**: lazy-import `detect.ts` (first click only), run on current image, replace regions

### Detect flow

```ts
async function runDetection() {
  setStatus('Loading detector…')
  const { detectRegions } = await import('./detect.ts')
  setStatus('Detecting stickers…')
  await nextFrame() // let the status paint
  const regions = detectRegions(session.source.imageData)
  setRegions(regions)
  setStatus(`Found ${regions.length} stickers. Review, then continue.`)
}
```

`nextFrame()` is `new Promise(r => requestAnimationFrame(r))` — gives the UI time to paint the loading state before blocking on detection.

### `canvas.ts` API

Pure pixel logic, no React-style state. Takes a `CanvasRenderingContext2D` + a current state snapshot, renders the frame. Returns event handlers the component wires up.

```ts
export interface CanvasState {
  image: HTMLImageElement
  regions: Region[]
  selectedId: string | null
  view: { scale: number; x: number; y: number }
}

export interface CanvasHandlers {
  onPointerDown(e: PointerEvent): void
  onPointerMove(e: PointerEvent): void
  onPointerUp(e: PointerEvent): void
  onWheel(e: WheelEvent): void
}

export function createCanvas(
  canvas: HTMLCanvasElement,
  getState: () => CanvasState,
  patch: (changes: Partial<CanvasState>) => void,
): CanvasHandlers

export function draw(ctx: CanvasRenderingContext2D, state: CanvasState): void
```

The component calls `draw(ctx, state)` after any state change. `createCanvas` returns handlers that the component attaches and detaches on mount/unmount.

### Drawing details (port)

- Black checkerboard background outside the image bounds (transparent area)
- Image drawn at current view scale + offset
- Each region: 2px solid border (`colors.primary[500]` for selected, `colors.light[500]` for others). 1px white outline for contrast.
- Corner handles: 8px square at each corner of the selected region

## Transparency Stage (`stage-transparency.tsx` + `transparency.ts`)

### UI

A scrollable feed of side-by-side cards. Each card has:
- **Left half**: the original crop on a checkerboard background (for visual parity with the right)
- **Right half**: the transparent PNG result on the same checkerboard
- **Actions row** below: `Keep` (default after first render), `Skip`, `Adjust crop ↩ back to review`
- **Status indicator** while processing

Cards stream in top-to-bottom as inference completes. A header bar shows: "Processing 3 of 12…" with a progress bar.

### Flow

```ts
async function runTransparency() {
  setStatus('Loading background-removal model…')
  const { loadTransparencyEngine, removeBackground } = await import('./transparency.ts')

  // Show model download progress
  await loadTransparencyEngine((loaded, total, stage) => {
    setStatus(`Downloading model (${formatBytes(loaded)} / ${formatBytes(total)})`)
  })

  setStatus('Processing stickers…')
  for (const region of session.regions) {
    setCurrentRegion(region.id)
    const crop = cropImageData(session.source.imageData, region)
    try {
      const result = await removeBackground(crop)
      patchResults(region.id, result)
      patchApproved(region.id, true) // default to keep
    } catch (error) {
      patchResults(region.id, { error: String(error) })
    }
  }
  setStatus(`Done. Review and continue.`)
}
```

Crops are computed in JS from the source `ImageData`:

```ts
function cropImageData(source: ImageData, region: Region): ImageData {
  // Create offscreen canvas at region size, draw source at offset.
  const offscreen = new OffscreenCanvas(region.width, region.height)
  const ctx = offscreen.getContext('2d')!
  // Convert source ImageData to canvas via temp canvas, then crop.
  // OR: copy bytes directly via Uint8ClampedArray slicing for a tight loop.
  return ctx.getImageData(0, 0, region.width, region.height)
}
```

Implementation note: we'll likely cache a full `OffscreenCanvas` of the source image at controller init so cropping is a single `drawImage` call per region.

### `transparency.ts` API

```ts
export interface TransparencyResult {
  pngBlob: Blob
  width: number    // after alpha-trim + 8px padding
  height: number
}

export type ProgressCallback = (loaded: number, total: number, stage: string) => void

export async function loadTransparencyEngine(onProgress?: ProgressCallback): Promise<void>

export async function removeBackground(crop: ImageData): Promise<TransparencyResult>
```

### Implementation

```ts
let engine: any = null
let processor: any = null
let loading: Promise<void> | null = null

export async function loadTransparencyEngine(onProgress) {
  if (engine) return
  if (loading) return loading
  loading = (async () => {
    const tjs = await import('@huggingface/transformers')
    const { AutoModel, AutoProcessor, env } = tjs
    env.allowRemoteModels = true
    env.useBrowserCache = true

    const modelId = 'Xenova/u2netp'
    engine = await AutoModel.from_pretrained(modelId, {
      device: pickDevice(),
      progress_callback: (p: any) => {
        if (p.status === 'progress' && onProgress) {
          onProgress(p.loaded, p.total, 'model')
        }
      },
    })
    processor = await AutoProcessor.from_pretrained(modelId)
  })()
  await loading
}

function pickDevice(): 'webgpu' | 'wasm' {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) return 'webgpu'
  return 'wasm'
}

export async function removeBackground(crop: ImageData): Promise<TransparencyResult> {
  if (!engine || !processor) throw new Error('engine not loaded')
  const { RawImage } = await import('@huggingface/transformers')

  const rawImage = new RawImage(crop.data, crop.width, crop.height, 4)
  const { pixel_values } = await processor(rawImage)
  const result = await engine({ input: pixel_values })

  // result.output: [1, 1, 320, 320] alpha logits
  const alpha = await tensorToAlphaMask(result.output, crop.width, crop.height)
  const rgba = applyAlphaMask(crop, alpha)
  const trimmed = trimTransparentAndPad(rgba, 8)
  const pngBlob = await imageDataToPngBlob(trimmed)

  return { pngBlob, width: trimmed.width, height: trimmed.height }
}

// helpers below
```

### Helper functions

- **`tensorToAlphaMask`**: extract the [1,1,H,W] float32 tensor data, bilinear resize to crop dimensions, convert to `Uint8ClampedArray` of 0-255 alpha values.
- **`applyAlphaMask(crop, alpha)`**: per-pixel loop, copy RGB from crop, set alpha from mask. Returns new `ImageData`.
- **`trimTransparentAndPad(image, pad)`**:
  1. Find bbox of non-zero alpha pixels (scan rows/columns from edges inward).
  2. If no non-zero pixels: return original.
  3. Allocate new `Uint8ClampedArray` of size `(bboxW + 2*pad) × (bboxH + 2*pad) × 4`, all zeros.
  4. Copy trimmed region in at offset `(pad, pad)`.
  5. Return new ImageData.
- **`imageDataToPngBlob(image)`**: `OffscreenCanvas` + `putImageData` + `convertToBlob({ type: 'image/png' })`.

### Failure modes

- **Model fails to load** (network, CDN down, browser blocks): surface error in UI, show retry button. Stay on transparency stage.
- **Single inference throws** (OOM on a huge crop, weird tensor shapes): mark that region as failed in the cards; user can adjust crop or skip.
- **WebGPU init fails on a browser that claims to support it**: caught inside transformers.js, automatic WASM fallback.

## Finalize Stage (`stage-finalize.tsx`)

### UI

Grid of cards (max-width 200px each, flex-wrap):
- Sticker thumbnail (transparent PNG on checkerboard)
- Name input (defaults to `sticker 1 of 5`, `sticker 2 of 5`, etc.)
- Per-card status icon: idle, uploading, success ✓, error ✕
- Per-card error message inline + Retry button on failure

Top bar:
- "Upload all" primary button
- Counter: "0 of 5 uploaded"
- Once all done: "Done. View your stickers →" link to `/profile/<username>`

### Upload flow

```ts
async function uploadAll() {
  for (const regionId of approved) {
    const result = transparencyResults.get(regionId)!
    const name = nameByRegion.get(regionId)!
    patchStatus(regionId, { state: 'uploading' })
    try {
      const file = new File([result.pngBlob], `${name}.png`, { type: 'image/png' })
      const form = new FormData()
      form.set('_csrf', getCsrfToken())
      form.set('name', name)
      form.set('image', file)
      const res = await fetch(routes.uploadSticker.action.href(), {
        method: 'POST',
        body: form,
      })
      if (res.status === 303) {
        // success — extract slug from Location
        const loc = res.headers.get('location') ?? ''
        const slug = loc.split('/').pop() ?? ''
        patchStatus(regionId, { state: 'success', stickerSlug: slug })
      } else {
        const errText = await res.text()
        patchStatus(regionId, { state: 'error', message: errText.slice(0, 120) })
      }
    } catch (error) {
      patchStatus(regionId, { state: 'error', message: String(error) })
    }
  }
}
```

The endpoint is `routes.uploadSticker.action.href()` (the existing `/upload-sticker` form action). It returns a 303 redirect on success. We don't follow the redirect — we parse the Location header to get the new sticker's slug for our success state.

### Retry per sticker

Click "Retry" on a failed card → re-run the upload for just that sticker.

### Concurrency

Sequential, not parallel. Sequential keeps the progress UI accurate and avoids hammering the server. For ≤30 stickers at ~1s each, total upload time is manageable.

## Server-Side Changes

Minimal:

1. **`app/routes.ts`**: add `batchUploadStickers: '/upload-stickers/batch'`.
2. **`app/router.ts`**: nothing — top-level leaf route, handled by root controller.
3. **`app/actions/controller.tsx`**: add `batchUploadStickers` action that renders `<BatchUploadStickersPage user={...} csrfToken={...} />`. Auth-gated (redirect to login).
4. **`app/actions/batch-upload-stickers-page.tsx`** (new): the page component. Renders a header, a workspace `<div>`, and mounts `<BatchUploadStickersApp />` as a clientEntry inside the workspace. Includes the `<meta name="csrf-token">` tag.
5. **`app/actions/upload-sticker-page.tsx`** (modify): add a small "have a bunch? try batch upload →" link at the bottom of the form.
6. **`app/data/roadmap.ts`**: add a "Recently shipped" or "Focus" entry for batch upload.

The existing `POST /upload-sticker` form action handles each per-sticker upload from the client. No changes to that endpoint.

## Dependencies

Add to `package.json`:
- `@huggingface/transformers` — pinned to a known-good version. Latest at time of writing: v3.x. Will need to verify exact version supports the API used.

Asset server should already handle `node_modules/@huggingface/**` since `allow: ['app/assets/**', 'node_modules/**']` is set. Need to confirm — the package may have non-JS files (WASM binaries, tokenizers) that need to be reachable.

## Testing

### Pure-JS unit tests

These can run under `node:test` since they don't need a browser:

- `detect.ts` — test against synthetic ImageData fixtures generated programmatically (similar to the Python tool's tests). At least 3 cases:
  - Plain background + 3 distinct rectangles → detects 3 regions
  - Gradient background → detects nothing wider than 50% of image
  - All-noise image → detects nothing or very few

- `transparency.ts` helpers (the non-ML ones): `trimTransparentAndPad`, `applyAlphaMask`, `tensorToAlphaMask`. Synthetic Uint8ClampedArray fixtures.

`ImageData` needs a polyfill or constructor in Node — we can use `new ImageData(uint8clampedarray, width, height)` which is available in Node 22+.

### Browser-only behavior

We won't write component tests for the canvas interaction, the stage flow, or the actual model inference. Those are verified manually before merging — a "manual verification" section in the PR description.

### What we manually verify

1. **Photo upload**: file picker accepts JPG/PNG/WebP/HEIC, rejects non-images
2. **Detection**: produces sensible boxes on the test fixture image (we'll include a test image in `public/images/test-stickers.jpg`)
3. **Canvas review**: drag, resize, add, delete, pan, zoom all work
4. **Transparency**: model loads (progress bar visible), inference completes per region, results show in cards
5. **Approve/skip/adjust**: state transitions work
6. **Upload**: sequential POSTs succeed, success/failure shown correctly, retry works
7. **WebGPU fallback**: feature works in Firefox (no WebGPU) via WASM
8. **Cache verification**: refresh page, re-enter transparency stage, model loads instantly from cache

## Risks

- **First-load UX**: Transformers.js + WASM + model = ~8 MB on first use. Users on slow connections will wait. Mitigation: clear progress UI, "first-time loading" copy, cache after first use makes repeat use instant.
- **iOS Safari WebGPU support is recent (Safari 18+)**. Older iOS will hit WASM path, ~5-10× slower. Inference times of 5-15s per sticker on a small phone CPU. We'll surface "this may take a minute" copy when falling back to WASM.
- **Detection accuracy depends on image quality**: poor lighting, similar-colored stickers next to each other, busy backgrounds. The user always has manual add/delete/adjust as escape hatches. We won't tune the algorithm aggressively in v1.
- **Model output quality on cropped sticker images**: u2netp is small. Edges may be ragged on stickers with thin elements (text, line art). User can skip those and re-shoot the sticker for single upload. If complaints come in, we add a "use higher quality model (25MB)" toggle that swaps to modnet.
- **transformers.js bundle integration with our asset server**: untested. We may need to allow specific subpaths or copy the WASM files into `public/`. To be debugged during implementation.
- **Memory pressure on phones**: holding a full source ImageData (~12 MB for a 2000×1500 photo) + N region crops + N transparent PNG blobs can pressure mobile RAM. Mitigation: release `ImageData` after detection, only hold compressed PNGs after transparency.

## Verification

After implementation:

- `npm run typecheck` — clean
- `npm test` — existing tests pass + new detect/transparency-helpers tests pass
- Manual browser verification as enumerated above, against a test fixture image of 3-5 stickers on a plain background
- Successfully upload at least one batch of 3+ stickers end-to-end on dev, with the resulting sticker rows visible at `/stickers`
