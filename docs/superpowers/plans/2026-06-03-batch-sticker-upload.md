# Batch Sticker Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/upload-stickers/batch` page that lets a user upload one overhead photo of multiple stickers and end up with N transparent-PNG sticker rows. All processing client-side; uses existing single-sticker upload endpoint for the final step.

**Architecture:** A new top-level page renders a single `clientEntry` component (`BatchUploadStickersApp`). The component owns a 4-stage state machine (upload → review → transparency → finalize). Detection is pure JS (port of Python's vision.py). Background removal is transformers.js + Xenova/u2netp model. All heavy modules lazy-load on stage entry. Final uploads are sequential POSTs to the existing `/upload-sticker` action.

**Tech Stack:** Remix 3 with `clientEntry`, `@huggingface/transformers` (new dep), pure-JS image processing in TypeScript, `node:test`.

**Spec:** `docs/superpowers/specs/2026-06-03-batch-sticker-upload-design.md`

**Working branch:** TBD — start from `main`. Recommended: `git checkout -b batch-sticker-upload`.

---

## File Structure

**Create:**
- `app/assets/batch-upload-stickers/types.ts`
- `app/assets/batch-upload-stickers/controller.tsx` (clientEntry root)
- `app/assets/batch-upload-stickers/stage-upload.tsx`
- `app/assets/batch-upload-stickers/stage-review.tsx`
- `app/assets/batch-upload-stickers/stage-transparency.tsx`
- `app/assets/batch-upload-stickers/stage-finalize.tsx`
- `app/assets/batch-upload-stickers/detect.ts`
- `app/assets/batch-upload-stickers/canvas.ts`
- `app/assets/batch-upload-stickers/transparency.ts`
- `app/actions/batch-upload-stickers-page.tsx`
- `public/images/test-stickers.jpg` (manual: a test fixture photo of 3-5 stickers)
- `test/detect.test.ts`
- `test/transparency-helpers.test.ts`

**Modify:**
- `app/routes.ts` — add `batchUploadStickers`
- `app/actions/controller.tsx` — add `batchUploadStickers` action
- `app/actions/upload-sticker-page.tsx` — add link to batch page
- `app/data/roadmap.ts` — entry
- `package.json` — add `@huggingface/transformers`
- possibly `app/assets.ts` — if transformers.js needs explicit allow rules

**Do NOT modify:**
- Existing sticker upload, surface upload, or any other controllers
- The auth or session middleware
- The image processing pipeline (`app/data/upload-image.ts`)

---

## Notes for the executing agent

- **First clientEntry-heavy feature in this codebase.** We added one tiny `CopyButton` in `app/assets/copy-button.tsx` recently. The batch upload is much bigger. Read `app/assets/copy-button.tsx` and `app/middleware/render.tsx` first to understand how clientEntry resolves to bundled URLs.
- **Asset server `allow` list** is in `app/assets.ts`. Files under `app/assets/**` and `node_modules/**` are browser-loadable. Files in `app/ui/` (theme tokens) are NOT — inline color hex codes in client components, see `app/assets/copy-button.tsx` for the pattern.
- **`transformers.js` may need allow tweaks.** It loads its WASM runtime and the model from CDN by default. If the bundle needs files served locally, add explicit allow entries.
- **No new server endpoints.** The final step calls the existing `POST /upload-sticker` action repeatedly. CSRF token is rendered into a `<meta name="csrf-token">` tag on the page.
- **The Python reference tool is in `tmp/sticker-catalog/`.** Read `app/vision.py` and `app/static/app.js` before implementing detection or the canvas UI.
- **Lazy loading is essential.** Each stage module is dynamic-imported. Don't import everything in `controller.tsx`.
- **iOS Safari support matters.** Test in mobile Safari before merging. WebGPU is Safari 18+; WASM fallback is everywhere.

---

## Task 1: Add route, page, controller wiring

**Files:**
- Modify: `app/routes.ts`
- Modify: `app/actions/controller.tsx`
- Create: `app/actions/batch-upload-stickers-page.tsx`
- Modify: `app/actions/upload-sticker-page.tsx`

- [ ] **Step 1.1: Add the route**

Edit `app/routes.ts`. Add next to the existing `uploadSticker` route:

```ts
batchUploadStickers: '/upload-stickers/batch',
```

- [ ] **Step 1.2: Create the page component**

Create `app/actions/batch-upload-stickers-page.tsx`. The component renders a Document with a workspace div containing the clientEntry mount point. Also renders the CSRF meta tag.

```tsx
import { css } from 'remix/ui'

import { BatchUploadStickersApp } from '../assets/batch-upload-stickers/controller.tsx'
import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'

export interface BatchUploadStickersPageProps {
  user: HeaderUser
  csrfToken: string
}

export function BatchUploadStickersPage() {
  return ({ user, csrfToken }: BatchUploadStickersPageProps) => (
    <Document title="batch upload stickers - stickertrade" user={user}>
      <meta name="csrf-token" content={csrfToken} />
      <main mix={mainStyle}>
        <h1>batch upload stickers</h1>
        <p mix={blurbStyle}>
          upload one photo of multiple stickers laid out on a flat surface.
          we'll detect each sticker, remove backgrounds, and let you review
          before uploading them all.
        </p>
        <BatchUploadStickersApp />
      </main>
    </Document>
  )
}

const mainStyle = css({
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '1rem',
})

const blurbStyle = css({
  marginBottom: '1.5rem',
  opacity: 0.8,
})
```

- [ ] **Step 1.3: Add the controller action**

Edit `app/actions/controller.tsx`. Add `batchUploadStickers` action. Auth-gated. Reads the CSRF token from the session and passes it to the page.

```tsx
// In imports
import { BatchUploadStickersPage } from './batch-upload-stickers-page.tsx'
import { generateCsrfToken } from 'remix/middleware/csrf'  // or wherever it lives

// In actions object:
batchUploadStickers(context) {
  const user = getCurrentUser(context)
  if (!user) return redirect(routes.login.index.href(), 303)

  const csrfToken = /* read from session — copy pattern from upload-sticker controller */

  return context.render(<BatchUploadStickersPage user={user} csrfToken={csrfToken} />)
},
```

The CSRF token retrieval pattern: look at how `upload-sticker/controller.tsx` or `CsrfField` derives the token. It comes from the session via the `csrfOrBearer` middleware. The token is the value of `_csrf` in form posts — we need to render it into a meta tag so JS can read it.

If unsure how to extract the token outside of `<CsrfField />`, look at the `CsrfField` implementation in `app/ui/form.tsx` and use the same mechanism.

- [ ] **Step 1.4: Create a minimal placeholder `BatchUploadStickersApp`**

Create `app/assets/batch-upload-stickers/controller.tsx`. For Task 1, this is a placeholder that just renders "Batch upload coming soon" — we'll fill it in Task 3.

```tsx
import { clientEntry, css, type Handle } from 'remix/ui'

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
  border: '2px dashed #f1eee466',
  textAlign: 'center',
  borderRadius: '0.5rem',
})
```

- [ ] **Step 1.5: Add the link from `/upload-sticker`**

Edit `app/actions/upload-sticker-page.tsx`. Add a small link below the form:

```tsx
<p mix={linkRowStyle}>
  have a bunch?{' '}
  <a href={routes.batchUploadStickers.href()}>try batch upload →</a>
</p>
```

Define `linkRowStyle` near the other styles in the file.

- [ ] **Step 1.6: Typecheck + test**

```bash
npm run typecheck
npm test
```

Expected: clean. The placeholder clientEntry should compile.

- [ ] **Step 1.7: Browser-verify**

```bash
SESSION_SECRET=dev npm run dev
```

Visit `http://localhost:44100/upload-stickers/batch` after logging in. Should render the page with the placeholder text. Check console: no errors. The link from `/upload-sticker` should be present.

- [ ] **Step 1.8: Commit**

```bash
git add app/routes.ts app/actions/controller.tsx app/actions/batch-upload-stickers-page.tsx app/actions/upload-sticker-page.tsx app/assets/batch-upload-stickers/
git commit -m "scaffold batch sticker upload page + clientEntry placeholder"
```

---

## Task 2: Detection algorithm + tests

**Files:**
- Create: `app/assets/batch-upload-stickers/detect.ts`
- Create: `app/assets/batch-upload-stickers/types.ts`
- Create: `test/detect.test.ts`

Port the Python detection algorithm. TDD: write the tests first against synthetic fixtures, then implement.

- [ ] **Step 2.1: Create `types.ts` with the `Region` interface**

```ts
export interface Region {
  id: string
  x: number
  y: number
  width: number
  height: number
  score: number
}

export type Stage = 'upload' | 'review' | 'transparency' | 'finalize'
```

- [ ] **Step 2.2: Write the failing test file**

Create `test/detect.test.ts`. Generate synthetic `ImageData` and assert the detector finds the right number of regions.

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { detectRegions } from '../app/assets/batch-upload-stickers/detect.ts'

function makeImageData(width: number, height: number, fill: [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0]
    data[i * 4 + 1] = fill[1]
    data[i * 4 + 2] = fill[2]
    data[i * 4 + 3] = 255
  }
  return new ImageData(data, width, height)
}

function fillRect(img: ImageData, x: number, y: number, w: number, h: number, color: [number, number, number]): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const idx = (py * img.width + px) * 4
      img.data[idx] = color[0]
      img.data[idx + 1] = color[1]
      img.data[idx + 2] = color[2]
      img.data[idx + 3] = 255
    }
  }
}

describe('detectRegions', () => {
  it('detects 3 distinct rectangles on a plain background', () => {
    const img = makeImageData(900, 600, [185, 178, 164])
    fillRect(img, 80, 80, 180, 150, [245, 246, 250])
    fillRect(img, 390, 120, 180, 180, [240, 80, 90])
    fillRect(img, 650, 330, 170, 170, [40, 42, 58])

    const regions = detectRegions(img)
    assert.equal(regions.length, 3)
    assert.ok(regions.every((r) => r.width > 100 && r.height > 100))
  })

  it('returns empty array for a uniform image', () => {
    const img = makeImageData(400, 400, [128, 128, 128])
    const regions = detectRegions(img)
    assert.equal(regions.length, 0)
  })

  it('returns empty array for a tiny image', () => {
    const img = makeImageData(20, 20, [255, 0, 0])
    const regions = detectRegions(img)
    assert.equal(regions.length, 0)
  })
})
```

- [ ] **Step 2.3: Run the failing test**

```bash
npm test -- --test-name-pattern='detectRegions'
```

Expected: FAIL — `detect.ts` does not export `detectRegions`.

- [ ] **Step 2.4: Implement `detect.ts`**

This is the largest task. Port from `tmp/sticker-catalog/app/vision.py`. Read that file first.

The function exports `detectRegions(imageData: ImageData): Region[]`. Pipeline:

1. **Downscale** if `max(w, h) > 1600`. Use `OffscreenCanvas` if available, else create a canvas. Document this:
   - In Node tests, `OffscreenCanvas` isn't available. Add a fallback that does nearest-neighbor downscale via a typed-array loop. The fallback is also fine for production (slower but works everywhere).
2. **`rgbToLab(r, g, b)`** — inline function. sRGB linearize → XYZ → LAB. Look up the standard formulas; e.g. `https://en.wikipedia.org/wiki/SRGB#The_sRGB_transfer_function_(%22gamma%22)` and CIELAB conversion.
3. **`rgbToHsv(r, g, b)`** — standard HSV.
4. Allocate Float32Array for L, A, B (3 separate). Uint8Array for S only (we don't need H or V).
5. Fill the arrays in one pass over imageData.
6. **Border sampling**: collect indices of the outer `border = max(8, min(w,h) / 30)` rows/cols. Compute median LAB (per-channel median via sorting). Compute distances from each border pixel to the bg median; take 96th percentile.
7. **Color mask** (`Uint8Array`): for each pixel, compute LAB distance to bg. Threshold = `max(24, p96 + 8)`.
8. **Saturation mask**: threshold S at `max(55, percentile96(border_S) + 24)`. OR with color mask in-place.
9. **Median blur 3x3** + **morph open 3x3** + **morph close 9x9**. Implement each as a separable pass over the Uint8Array.
10. **Contrast pipeline**:
    - Compute grayscale `Uint8Array` from RGB.
    - Box-blur the grayscale (approximate Gaussian σ=25 with 3 passes of box blur radius 15).
    - Absolute diff per pixel: `|gray - blurred|`.
    - Normalize to 0-255.
    - Threshold > 35 to produce the contrast mask.
    - Morph open 3x3, close 13x13.
11. **Connected components** on each mask (4-connectivity). Two-pass union-find. Return `Map<label, {x, y, w, h, area}>`.
12. **Filter regions per mask**: area, min dim, max bbox area, aspect ratio, fill ratio (see spec).
13. **Pad each bbox 4%**, clamp to mask bounds.
14. **Scale back to source coordinates** via `1 / downscale`.
15. **Merge across both masks**: iteratively union pairs where overlap_area / smaller_area > 0.35.
16. **Sort by (y, x)** ascending.
17. **Assign IDs**: `crypto.randomUUID().slice(0, 8)` per region.

Implementation notes:
- Use `Float64Array` for percentile sorting to avoid precision issues with `Float32Array.sort`.
- Connected components: provisional labels start at 1; 0 means background. DSU is a `Int32Array` of size `numLabels`. Second pass collapses parent chains and accumulates bbox.
- For Node tests, `crypto.randomUUID()` is available via `globalThis.crypto.randomUUID()` in Node 20+. If not, fall back to a counter.

Estimated size: ~350 lines.

- [ ] **Step 2.5: Run tests until passing**

```bash
npm test -- --test-name-pattern='detectRegions'
```

Tune thresholds if needed. The Python tool was tuned against real sticker photos; for our synthetic test fixtures, the thresholds should be lenient. If the tests fail because synthetic flat-color rectangles don't behave like real photos:
- Add slight noise to the synthetic fixtures (e.g., +/- 3 per channel) to make them more realistic.
- OR lower the contrast threshold slightly.
- Don't tune so aggressively that real photos break — match the Python tool's behavior.

- [ ] **Step 2.6: Run full suite**

```bash
npm run typecheck && npm test
```

Expected: all existing 92ish tests pass + the new 3 detect tests pass.

- [ ] **Step 2.7: Commit**

```bash
git add app/assets/batch-upload-stickers/types.ts app/assets/batch-upload-stickers/detect.ts test/detect.test.ts
git commit -m "batch upload: pure-JS bounding-box detector"
```

---

## Task 3: Canvas review UI (stage-review + canvas.ts)

**Files:**
- Create: `app/assets/batch-upload-stickers/canvas.ts`
- Create: `app/assets/batch-upload-stickers/stage-review.tsx`
- Modify: `app/assets/batch-upload-stickers/controller.tsx` (wire the stage)

- [ ] **Step 3.1: Create `canvas.ts`**

Port the canvas interaction logic from `tmp/sticker-catalog/app/static/app.js`. Read that file first — specifically the pointer event handlers, view/zoom logic, hitTest, draw, screenToImage helpers.

Public API:

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

export function fitImage(canvas: HTMLCanvasElement, image: HTMLImageElement): { scale: number; x: number; y: number }

export function screenToImage(canvas: HTMLCanvasElement, view: CanvasState['view'], sx: number, sy: number): { x: number; y: number }
```

Port the pointer behavior verbatim from the Python tool's `app.js`. Estimated 350 lines.

- [ ] **Step 3.2: Create `stage-review.tsx`**

The component that owns the canvas DOM element and wires `canvas.ts` to the lifecycle. Renders the toolbar (Detect, Add, Delete, Next, Back).

Inputs (received from controller via handle):
- `image: HTMLImageElement`
- `imageData: ImageData`
- `regions: Region[]`
- `selectedId: string | null`
- callbacks: `setRegions`, `setSelectedId`, `goNext`, `goBack`

Use `handle.props` and `handle.update()` for the canvas state (view, selected). Use callbacks for state that lives in the parent.

Detect button handler:

```ts
async function onDetect() {
  setStatus('Loading detector…')
  await nextFrame()
  const { detectRegions } = await import('./detect.ts')
  setStatus('Detecting stickers…')
  await nextFrame()
  const result = detectRegions(handle.props.imageData)
  handle.props.setRegions(result)
  setStatus(`Found ${result.length} stickers.`)
}
```

Estimated 200 lines.

- [ ] **Step 3.3: Wire the stage into `controller.tsx`**

The main `BatchUploadStickersApp` becomes a stage state machine. Manages `Stage`, `source`, `regions`, etc. Dynamic-imports stage modules.

```tsx
export const BatchUploadStickersApp = clientEntry(
  import.meta.url,
  function BatchUploadStickersApp(handle: Handle<{}>) {
    let stage: Stage = 'upload'
    let source: { image: HTMLImageElement; imageData: ImageData; width: number; height: number } | null = null
    let regions: Region[] = []
    let selectedId: string | null = null
    let stageComponent: any = null

    async function loadStage(next: Stage) {
      // dynamic import based on `next`
      // cache loaded components
      // setLoading(true) before, false after
      // handle.update()
    }

    return () => {
      if (!stageComponent) return <Loading />
      return stageComponent({ ... })
    }
  },
)
```

For now (this task), upload stage is still a placeholder; the review stage requires source data. To test, add a "Use test image" button in the upload placeholder that loads `/images/test-stickers.jpg` (which we'll add manually) and transitions to review.

- [ ] **Step 3.4: Browser-verify**

Start the dev server, navigate to the batch page, click "Use test image" (or the real file picker once Task 4 lands), verify the canvas renders. Test:
- Detect button → boxes appear
- Drag a box → moves
- Drag a corner → resizes
- Add → new box at center
- Click empty → deselects
- Wheel → zooms
- Delete key → removes selected

- [ ] **Step 3.5: Commit**

```bash
git add app/assets/batch-upload-stickers/canvas.ts app/assets/batch-upload-stickers/stage-review.tsx app/assets/batch-upload-stickers/controller.tsx
git commit -m "batch upload: canvas review stage with drag/resize/add/delete"
```

---

## Task 4: Upload stage (real file picker, image decoding)

**Files:**
- Create: `app/assets/batch-upload-stickers/stage-upload.tsx`
- Modify: `app/assets/batch-upload-stickers/controller.tsx`

- [ ] **Step 4.1: Create `stage-upload.tsx`**

The component. Drop zone + file picker. On file selected:
- Validate MIME (image/png, image/jpeg, image/webp, image/heic)
- Validate size (≤10 MB)
- Decode via `createImageBitmap` (preserves orientation) or `new Image() + URL.createObjectURL`
- Build `ImageData` via an offscreen canvas
- Call `onLoaded({ image, imageData, width, height })`

Show file size limits and accepted formats in the UI.

- [ ] **Step 4.2: Wire upload stage into controller**

Replace the test-image button with the real upload stage. On `onLoaded`, transition to review.

- [ ] **Step 4.3: Browser-verify**

Upload an actual photo of stickers. Should auto-transition to review. Detection should find boxes.

- [ ] **Step 4.4: Commit**

```bash
git add app/assets/batch-upload-stickers/stage-upload.tsx app/assets/batch-upload-stickers/controller.tsx
git commit -m "batch upload: real file picker for source photo"
```

---

## Task 5: Add @huggingface/transformers dependency + transparency helpers

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `app/assets/batch-upload-stickers/transparency.ts`
- Create: `test/transparency-helpers.test.ts`

- [ ] **Step 5.1: Install transformers.js**

```bash
npm install @huggingface/transformers
```

Use the latest stable. Pin the version in package.json.

- [ ] **Step 5.2: Verify the bundle is reachable**

```bash
SESSION_SECRET=dev npm run dev
```

Visit `http://localhost:44100/assets/node_modules/@huggingface/transformers/dist/transformers.web.min.js` (or similar path). If it returns the JS, the asset server is happy. If it 404s or returns the allow-list error, update `app/assets.ts` allow rules.

Likely the transformers dist files will work directly under `node_modules/@huggingface/transformers/dist/...` because the existing allow rule `node_modules/**` covers them.

- [ ] **Step 5.3: Implement transparency helpers (non-ML)**

In `transparency.ts`, write pure helpers first — they can be unit-tested without the model:

```ts
export function applyAlphaMask(crop: ImageData, alpha: Uint8ClampedArray): ImageData
export function trimTransparentAndPad(image: ImageData, pad: number): ImageData
export function tensorToAlphaMask(tensorData: Float32Array, srcW: number, srcH: number, dstW: number, dstH: number): Uint8ClampedArray
export async function imageDataToPngBlob(image: ImageData): Promise<Blob>
```

- `applyAlphaMask`: tight loop, copy RGB from crop, set alpha from mask.
- `trimTransparentAndPad`: scan for bbox of non-zero alpha; allocate padded RGBA; copy.
- `tensorToAlphaMask`: bilinear resize from `srcW × srcH` to `dstW × dstH`. Convert float 0..1 to uint8 0..255.
- `imageDataToPngBlob`: `OffscreenCanvas` + `convertToBlob`. Fallback to a regular canvas if OffscreenCanvas isn't available.

- [ ] **Step 5.4: Write tests for the helpers**

Create `test/transparency-helpers.test.ts`. Test each helper with synthetic data.

```ts
describe('applyAlphaMask', () => {
  it('preserves RGB, sets alpha from mask', () => {
    // 2x2 red image
    const crop = new ImageData(new Uint8ClampedArray([
      255,0,0,255,  255,0,0,255,
      255,0,0,255,  255,0,0,255,
    ]), 2, 2)
    const alpha = new Uint8ClampedArray([0, 128, 200, 255])
    const out = applyAlphaMask(crop, alpha)
    assert.equal(out.data[3], 0)
    assert.equal(out.data[7], 128)
    assert.equal(out.data[11], 200)
    assert.equal(out.data[15], 255)
    assert.equal(out.data[0], 255) // R preserved
  })
})

describe('trimTransparentAndPad', () => {
  it('trims fully-transparent borders and adds 8px padding', () => {
    // 10x10 image with a 4x4 opaque square at (3,3)
    const data = new Uint8ClampedArray(10 * 10 * 4)
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        const i = (y * 10 + x) * 4
        data[i] = 255
        data[i + 1] = 0
        data[i + 2] = 0
        data[i + 3] = 255
      }
    }
    const img = new ImageData(data, 10, 10)
    const out = trimTransparentAndPad(img, 8)
    assert.equal(out.width, 4 + 16)
    assert.equal(out.height, 4 + 16)
    // The opaque pixel should now be at (8, 8)
    const idx = (8 * out.width + 8) * 4
    assert.equal(out.data[idx + 3], 255)
  })

  it('returns unchanged for fully-transparent image', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4) // all zeros
    const img = new ImageData(data, 4, 4)
    const out = trimTransparentAndPad(img, 8)
    assert.equal(out.width, 4)
    assert.equal(out.height, 4)
  })
})

describe('tensorToAlphaMask', () => {
  it('bilinearly resizes a 2x2 tensor to 4x4', () => {
    const tensor = new Float32Array([0, 1, 1, 0])
    const out = tensorToAlphaMask(tensor, 2, 2, 4, 4)
    assert.equal(out.length, 16)
    // corners match input
    assert.equal(out[0], 0)
    // center should be ~ 128
    assert.ok(Math.abs(out[5] - 128) < 30)
  })
})
```

Run:
```bash
npm test -- --test-name-pattern='applyAlphaMask|trimTransparentAndPad|tensorToAlphaMask'
```

Expected: PASS.

- [ ] **Step 5.5: Implement `loadTransparencyEngine` and `removeBackground`**

In `transparency.ts`. The ML-using functions. Don't test these — they require browser context.

```ts
let engine: any = null
let processor: any = null
let loading: Promise<void> | null = null

export type ProgressCallback = (loaded: number, total: number, stage: string) => void

export async function loadTransparencyEngine(onProgress?: ProgressCallback): Promise<void> {
  if (engine) return
  if (loading) return loading
  loading = (async () => {
    const tjs = await import('@huggingface/transformers')
    tjs.env.allowRemoteModels = true
    tjs.env.useBrowserCache = true
    engine = await tjs.AutoModel.from_pretrained('Xenova/u2netp', {
      device: pickDevice(),
      progress_callback: (p: any) => {
        if (p.status === 'progress' && onProgress) {
          onProgress(p.loaded ?? 0, p.total ?? 0, 'model')
        }
      },
    })
    processor = await tjs.AutoProcessor.from_pretrained('Xenova/u2netp')
  })()
  await loading
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

export async function removeBackground(crop: ImageData): Promise<TransparencyResult> {
  if (!engine || !processor) throw new Error('engine not loaded')
  const tjs = await import('@huggingface/transformers')
  const rawImage = new tjs.RawImage(crop.data, crop.width, crop.height, 4)
  const { pixel_values } = await processor(rawImage)
  const result = await engine({ input: pixel_values })

  // result.output is a Tensor of shape [1, 1, 320, 320] with values in [0, 1]
  const tensor = result.output
  const data = tensor.data as Float32Array
  const [, , th, tw] = tensor.dims
  const alpha = tensorToAlphaMask(data, tw, th, crop.width, crop.height)
  const rgba = applyAlphaMask(crop, alpha)
  const trimmed = trimTransparentAndPad(rgba, 8)
  const pngBlob = await imageDataToPngBlob(trimmed)
  return { pngBlob, width: trimmed.width, height: trimmed.height }
}
```

The exact tensor shape and how to access data may differ — check the transformers.js docs (`node_modules/@huggingface/transformers/README.md`) or the demo at `https://github.com/huggingface/transformers.js-examples/tree/main/remove-background-webgpu` for the canonical pattern.

- [ ] **Step 5.6: Run all tests**

```bash
npm run typecheck && npm test
```

Expected: typecheck clean, all helper tests pass.

- [ ] **Step 5.7: Commit**

```bash
git add package.json package-lock.json app/assets/batch-upload-stickers/transparency.ts test/transparency-helpers.test.ts
git commit -m "batch upload: transparency engine + helper tests"
```

---

## Task 6: Transparency stage UI

**Files:**
- Create: `app/assets/batch-upload-stickers/stage-transparency.tsx`
- Modify: `app/assets/batch-upload-stickers/controller.tsx`

- [ ] **Step 6.1: Create `stage-transparency.tsx`**

The component renders a list of side-by-side cards. Each card shows:
- Original crop on a checkerboard background
- Transparent result on a checkerboard background (or "Processing…" indicator or error message)
- Action row: Keep / Skip / Adjust crop ↩

Top: progress bar + "X of Y processed" text.

State:
- For each region: status ('pending' | 'processing' | 'done' | 'error'), result (TransparencyResult or error message), userDecision ('keep' | 'skip' | undefined)

On mount, kick off the inference loop:

```ts
async function runTransparency() {
  setStatus('Loading background removal model (first use: ~5MB)…')
  const { loadTransparencyEngine, removeBackground } = await import('./transparency.ts')
  await loadTransparencyEngine((loaded, total) => {
    setStatus(`Downloading model: ${formatBytes(loaded)} / ${formatBytes(total)}`)
  })
  setStatus('Processing stickers…')
  for (const region of regions) {
    setRegionStatus(region.id, 'processing')
    try {
      const crop = cropImageDataForRegion(source, region)
      const result = await removeBackground(crop)
      setRegionResult(region.id, result)
      setRegionDecision(region.id, 'keep')
    } catch (error) {
      setRegionError(region.id, String(error))
    }
  }
  setStatus('Done. Review and continue.')
}
```

`cropImageDataForRegion` uses an OffscreenCanvas of the source image and `getImageData(rx, ry, rw, rh)` to get the crop.

The "Adjust crop ↩" button calls a parent callback that transitions back to review with `selectedId = region.id`.

Checkerboard background CSS: a tiled SVG or two-color linear gradient. Standard pattern.

Estimated 250 lines.

- [ ] **Step 6.2: Wire into controller**

Add `stage-transparency` to the stage loader. After review's "Next" → transition.

- [ ] **Step 6.3: Browser-verify**

Upload test image → detect → next → watch model load → watch results stream in → review approve/skip.

Note: first load downloads ~5MB. Subsequent loads should be near-instant (cached).

- [ ] **Step 6.4: Commit**

```bash
git add app/assets/batch-upload-stickers/stage-transparency.tsx app/assets/batch-upload-stickers/controller.tsx
git commit -m "batch upload: transparency stage with per-sticker review"
```

---

## Task 7: Finalize stage (upload)

**Files:**
- Create: `app/assets/batch-upload-stickers/stage-finalize.tsx`
- Modify: `app/assets/batch-upload-stickers/controller.tsx`

- [ ] **Step 7.1: Create `stage-finalize.tsx`**

Grid of cards. Each:
- Sticker thumbnail (transparent PNG)
- Name input (default: `sticker N of M`)
- Status indicator: idle | uploading | success | error
- On error: error message + Retry button

Top: "Upload all" primary button + counter.

Sequential upload loop:

```ts
async function uploadAll() {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
  for (const region of approvedRegions) {
    const result = transparencyResults.get(region.id)!
    const name = nameInputs.get(region.id)!
    setStatus(region.id, 'uploading')
    try {
      const file = new File([result.pngBlob], `${name}.png`, { type: 'image/png' })
      const form = new FormData()
      form.set('_csrf', csrfToken)
      form.set('name', name)
      form.set('image', file)
      const res = await fetch('/upload-sticker', {
        method: 'POST',
        body: form,
        redirect: 'manual',
      })
      // 303 (success) or 400 (validation failure) or other
      if (res.status === 303) {
        const loc = res.headers.get('location') ?? ''
        const slug = loc.split('/').pop() ?? ''
        setStatus(region.id, { state: 'success', stickerSlug: slug })
      } else {
        const text = await res.text()
        setStatus(region.id, { state: 'error', message: text.slice(0, 200) })
      }
    } catch (error) {
      setStatus(region.id, { state: 'error', message: String(error) })
    }
  }
}
```

After all done: "Done! View your stickers →" link to profile.

Estimated 200 lines.

- [ ] **Step 7.2: Wire into controller**

Add `stage-finalize` to the stage loader. After transparency's "Next" → transition.

- [ ] **Step 7.3: Browser-verify end-to-end**

Full flow: upload photo → detect → review → transparency → approve all → finalize → upload all → confirm new sticker rows at `/stickers`.

- [ ] **Step 7.4: Commit**

```bash
git add app/assets/batch-upload-stickers/stage-finalize.tsx app/assets/batch-upload-stickers/controller.tsx
git commit -m "batch upload: finalize stage with sequential per-sticker upload"
```

---

## Task 8: Polish, roadmap, manual verification, PR

**Files:**
- Modify: `app/data/roadmap.ts`
- Any polish on the new files

- [ ] **Step 8.1: Add roadmap entry**

Edit `app/data/roadmap.ts`. Add a "Recently shipped" entry:

```
- [x] Batch sticker upload — drop one photo of multiple stickers, get N transparent PNGs uploaded
```

- [ ] **Step 8.2: Manual verification checklist**

Run through the full flow at least once in:
- Desktop Chrome (WebGPU) — should be fast
- Desktop Firefox (no WebGPU, WASM fallback) — should still work, slower
- iOS Safari if available — verify WASM fallback works on phone

Verify:
- File picker accepts and rejects appropriate MIME types
- Detection finds reasonable boxes on a real photo of stickers
- All canvas interactions work (pan/zoom/move/resize/add/delete/select)
- Model loads with visible progress on first use, instant on second use (after refresh)
- Per-sticker transparency results look correct (background gone, sticker intact)
- "Adjust crop" returns to review stage with that region selected
- Skip works (sticker excluded from finalize)
- Sequential upload works, all stickers end up in DB
- Error handling: rename a sticker to an empty name, verify validation error renders
- Refresh the page mid-flow: state is reset (acceptable)

- [ ] **Step 8.3: Final typecheck + test**

```bash
npm run typecheck && npm test
```

Expected: clean + all tests pass.

- [ ] **Step 8.4: Push + PR**

```bash
git push -u origin batch-sticker-upload
gh pr create --base main --head batch-sticker-upload --title "batch sticker upload from one photo" --body "..."
```

PR body should include:
- Summary of the feature
- Bundle/load cost notes (first time ~5MB, cached after)
- Manual verification matrix (which browsers tested)
- Known limitations (WASM is slow, ragged edges on text stickers, etc.)
- Link to spec + plan

---

## Notes for the executing agent (final)

- **The most time-consuming task is Task 3 (canvas UI)**. Read the Python tool's `app.js` carefully and port faithfully. Don't try to redesign the UX.
- **Task 2 (detection)** is mathematically dense but straightforward — port one function at a time and unit-test progressively.
- **Task 5 (transformers.js wiring)** is where the bundle integration might bite. If the asset server can't serve the transformers.js files, take time to debug — don't paper over with copies into `public/`.
- **Task 6 (transparency UI)** has the most user-facing nuance. Take time to make the per-card UI clear. The user is making real decisions per sticker.
- **iOS Safari < 18 falls back to WASM** which can be slow (10-30s per sticker on older hardware). Surface that clearly in the UI ("processing may take a minute on this device").
- **Don't ship without testing in at least 2 browsers**. WebGPU code paths can hide failures on the dominant browser.
