import { clientEntry, css, on, type Handle } from 'remix/ui'

import type { StageFinalize as StageFinalizeType } from './stage-finalize.tsx'
import type { StageReview as StageReviewType } from './stage-review.tsx'
import type {
  RegionDecision,
  StageTransparency as StageTransparencyType,
} from './stage-transparency.tsx'
import type { StageUpload as StageUploadType } from './stage-upload.tsx'
import type { TransparencyResult } from './transparency.ts'
import type { Region, SourceImage, Stage } from './types.ts'

// Type-level note: `clientEntry`'s props generic is constrained to
// `SerializableProps`, which is `{ [k in string]: SerializableValue }`. An
// interface with named-only members doesn't satisfy that constraint in
// TypeScript even when every member is serializable, so we use a `type`
// alias here (intersected with an index signature) to make it pass.
export type BatchUploadStickersAppProps = {
  /** The current user's username; passed to finalize for the success link. */
  username: string
  /** Resolved `routes.uploadSticker.action.href()` — the existing form action. */
  uploadStickerUrl: string
  /** Resolved `routes.profile.href({ username })` — destination after upload. */
  profileUrl: string
  /** Resolved `routes.stickers.href()` — fallback link if profile is missing. */
  stickersUrl: string
}

// Theme colors inlined: app/ui/theme.ts is outside the asset server's allow
// list. The hex values match the `light.500` and `primary.500` tokens in
// `app/ui/theme.ts`.
const LIGHT_500 = '#f1eee4'
const PRIMARY_500 = '#f7a1c4'

// Toggle for the "use test image" affordance. We ship this as `true` so a
// first-time visitor can try the full flow without committing a photo of
// their own. The button points at the real fixture committed at
// `public/images/test-stickers.jpg` (a 1200×1600 photo of three stickers
// on a flat surface) with a silent fallback to a synthetic three-rectangle
// ImageData if the fixture ever 404s.
const SHOW_TEST_IMAGE_BUTTON = true

// Type aliases for the dynamically-imported stage components.
type StageReviewFn = typeof StageReviewType
type StageUploadFn = typeof StageUploadType
type StageTransparencyFn = typeof StageTransparencyType
type StageFinalizeFn = typeof StageFinalizeType

/**
 * Client-side root for the batch sticker upload flow. Owns the stage state
 * machine (upload → review → transparency → finalize). Each stage's code is
 * lazy-imported so the first paint of this page only ships the controller and
 * a small placeholder.
 *
 * The "use test image" button (gated behind `SHOW_TEST_IMAGE_BUTTON`) ships
 * enabled so first-time visitors can try the whole flow against a real
 * fixture (`/images/test-stickers.jpg`) without uploading their own photo.
 */
export const BatchUploadStickersApp = clientEntry<BatchUploadStickersAppProps>(
  import.meta.url,
  function BatchUploadStickersApp(handle: Handle<BatchUploadStickersAppProps>) {
    let stage: Stage = 'upload'
    let source: SourceImage | null = null
    let regions: Region[] = []
    let selectedId: string | null = null
    let loadingStage = false
    let loadError: string | null = null
    let testImageError: string | null = null

    // Cache loaded stage modules so re-entering a stage doesn't re-import.
    let StageReviewComponent: StageReviewFn | null = null
    let StageUploadComponent: StageUploadFn | null = null
    let StageTransparencyComponent: StageTransparencyFn | null = null
    let StageFinalizeComponent: StageFinalizeFn | null = null

    // Results forwarded to the finalize stage (Task 7). Set when the user
    // leaves the transparency stage; cleared if they head back to upload.
    let transparencyDecisions: Map<string, RegionDecision> | null = null
    let transparencyResults: Map<string, TransparencyResult> | null = null

    function setStage(next: Stage): void {
      stage = next
      // Any stage change clears any prior load error — otherwise the error UI
      // (which gates the entire render) would swallow the navigation.
      loadError = null
      handle.update()
    }

    async function loadStage(next: Stage): Promise<void> {
      loadingStage = true
      loadError = null
      handle.update()
      try {
        if (next === 'review') {
          if (!StageReviewComponent) {
            const mod = await import('./stage-review.tsx')
            StageReviewComponent = mod.StageReview
          }
        } else if (next === 'transparency') {
          if (!StageTransparencyComponent) {
            const mod = await import('./stage-transparency.tsx')
            StageTransparencyComponent = mod.StageTransparency
          }
        } else if (next === 'finalize') {
          if (!StageFinalizeComponent) {
            const mod = await import('./stage-finalize.tsx')
            StageFinalizeComponent = mod.StageFinalize
          }
        }
        stage = next
      } catch (error) {
        loadError = `Failed to load stage: ${String(error)}`
      } finally {
        loadingStage = false
        handle.update()
      }
    }

    /**
     * Eagerly load the upload-stage module on the client so the first paint
     * after hydration shows the real file picker rather than a loading
     * spinner. The controller body also runs server-side; we gate the
     * dynamic import on `typeof window` because `handle.update()` is not
     * implemented during SSR.
     */
    async function ensureUploadModule(): Promise<void> {
      if (StageUploadComponent) return
      try {
        const mod = await import('./stage-upload.tsx')
        StageUploadComponent = mod.StageUpload
        handle.update()
      } catch (error) {
        loadError = `Failed to load upload stage: ${String(error)}`
        handle.update()
      }
    }

    if (typeof window !== 'undefined') {
      // Kick off the upload module import as soon as the controller mounts.
      void ensureUploadModule()
    }

    function setRegions(next: Region[]): void {
      regions = next
      handle.update()
    }

    function setSelectedId(id: string | null): void {
      selectedId = id
      handle.update()
    }

    function goNext(): void {
      // Drop any stale transparency results from a previous pass: the user
      // is re-entering transparency with a fresh region set.
      transparencyDecisions = null
      transparencyResults = null
      void loadStage('transparency')
    }

    function goBack(): void {
      // Soft transition back to the upload stage. `setStage` only clears
      // `loadError`; `source`, `regions`, `selectedId`, and any cached
      // transparency results are preserved so the user can step back into
      // review without re-uploading or losing edits. The upload stage
      // itself will overwrite `source` only when the user picks a new file.
      setStage('upload')
    }

    /**
     * Called from the transparency stage when the user clicks "Adjust crop
     * ↩" on a card. Returns to the review stage with that region
     * pre-selected so the canvas immediately focuses it. The review-stage
     * module is already cached, so we skip `loadStage()` and flip the
     * stage synchronously.
     */
    function onAdjustCrop(regionId: string): void {
      selectedId = regionId
      setStage('review')
    }

    /**
     * Receive the keep/skip decisions and per-region transparency results
     * from the transparency stage and hand off to finalize. The finalize
     * stage is lazy-imported via `loadStage('finalize')`; while the bundle
     * resolves the controller shows the generic loading placeholder.
     */
    function onTransparencyNext(
      decisions: Map<string, RegionDecision>,
      results: Map<string, TransparencyResult>,
    ): void {
      transparencyDecisions = decisions
      transparencyResults = results
      void loadStage('finalize')
    }

    /**
     * Back from finalize: return to transparency without rebuilding the
     * results map (the transparency stage caches its own state and would
     * re-run inference on a fresh mount, but the saved results are still
     * referenced from finalize). We surface this transition as a soft
     * back-button; finalize itself hides the button once any upload has
     * succeeded server-side.
     */
    function onFinalizeBack(): void {
      // Don't null out `transparencyResults` — we want to be able to come
      // back to finalize if the user changes their mind. The transparency
      // stage instance gets unmounted and re-mounted on next entry, which
      // will rebuild its own state from props.
      setStage('transparency')
    }

    function onTransparencyBack(): void {
      // Drop the in-progress decisions; the transparency stage will re-run
      // inference if the user comes back.
      transparencyDecisions = null
      transparencyResults = null
      setStage('review')
    }

    /**
     * Called by `StageUpload` after a successful file decode. Promotes the
     * source onto the state machine and transitions to review. Region
     * selection is reset because they belong to whatever photo was loaded
     * previously.
     */
    function onSourceLoaded(next: SourceImage): void {
      source = next
      regions = []
      selectedId = null
      void loadStage('review')
    }

    /**
     * Build a synthetic 900×600 ImageData with three colored rectangles on a
     * warm-gray background. Mirrors the fixture in `test/detect.test.ts`.
     * Used as a fallback by the "use test image" button when the real
     * `/images/test-stickers.jpg` fixture is missing or fails to decode.
     */
    function makeSyntheticImageData(): ImageData {
      const w = 900
      const h = 600
      const data = new Uint8ClampedArray(w * h * 4)
      fillRect(data, w, 0, 0, w, h, [185, 178, 164])
      fillRect(data, w, 80, 80, 180, 150, [245, 246, 250])
      fillRect(data, w, 390, 120, 180, 180, [240, 80, 90])
      fillRect(data, w, 650, 330, 170, 170, [40, 42, 58])
      return new ImageData(data, w, h)
    }

    function fillRect(
      data: Uint8ClampedArray,
      stride: number,
      x: number,
      y: number,
      w: number,
      h: number,
      color: [number, number, number],
    ): void {
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          const i = (py * stride + px) * 4
          data[i] = color[0]
          data[i + 1] = color[1]
          data[i + 2] = color[2]
          data[i + 3] = 255
        }
      }
    }

    /**
     * Turn an ImageData into an HTMLImageElement by routing through a
     * temporary canvas + object URL. Slightly wasteful (we already have the
     * pixels) but the canvas rendering wants a drawable image.
     */
    async function imageDataToImage(imgData: ImageData): Promise<HTMLImageElement> {
      const off = document.createElement('canvas')
      off.width = imgData.width
      off.height = imgData.height
      const ctx = off.getContext('2d')
      if (!ctx) throw new Error('2d context not available')
      ctx.putImageData(imgData, 0, 0)
      const blob: Blob | null = await new Promise((resolve) =>
        off.toBlob((b) => resolve(b), 'image/png'),
      )
      if (!blob) throw new Error('toBlob returned null')
      const url = URL.createObjectURL(blob)
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('image decode failed'))
        img.src = url
      })
    }

    /**
     * Decode an existing image URL into an HTMLImageElement *and* an
     * ImageData (for the detector).
     */
    async function loadFromUrl(url: string): Promise<SourceImage> {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const next = new Image()
        next.crossOrigin = 'anonymous'
        next.onload = () => resolve(next)
        next.onerror = () => reject(new Error(`failed to load ${url}`))
        next.src = url
      })
      const w = img.naturalWidth
      const h = img.naturalHeight
      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      const ctx = off.getContext('2d')
      if (!ctx) throw new Error('2d context not available')
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, w, h)
      return { image: img, imageData, width: w, height: h }
    }

    async function onUseTestImage(): Promise<void> {
      testImageError = null
      loadingStage = true
      handle.update()
      try {
        // Try the real fixture first; silently fall back to a synthetic
        // three-rectangle ImageData if the fixture is missing or fails to
        // decode. The fallback exists because the affordance is also useful
        // in environments where the static asset isn't served (local dev
        // with a custom prefix, etc.).
        let src: SourceImage
        try {
          const head = await fetch('/images/test-stickers.jpg', { method: 'HEAD' })
          if (head.ok) {
            src = await loadFromUrl('/images/test-stickers.jpg')
          } else {
            throw new Error('fixture missing')
          }
        } catch {
          const imgData = makeSyntheticImageData()
          const img = await imageDataToImage(imgData)
          src = { image: img, imageData: imgData, width: imgData.width, height: imgData.height }
        }
        source = src
        regions = []
        selectedId = null
        await loadStage('review')
      } catch (error) {
        testImageError = String(error)
        loadingStage = false
        handle.update()
      }
    }

    return () => {
      if (loadingStage) {
        return (
          <div mix={placeholderStyle}>
            <p>loading…</p>
          </div>
        )
      }

      if (loadError) {
        return (
          <div mix={placeholderStyle}>
            <p mix={errorStyle}>{loadError}</p>
            <button type="button" mix={[btnStyle, on('click', () => setStage('upload'))]}>
              back
            </button>
          </div>
        )
      }

      if (stage === 'upload') {
        if (!StageUploadComponent) {
          // First paint before the dynamic import resolves. Fall through to
          // a minimal placeholder; `ensureUploadModule()` will flip
          // `handle.update()` once the bundle lands.
          return (
            <div mix={placeholderStyle}>
              <p>loading upload UI…</p>
            </div>
          )
        }
        const StageUpload = StageUploadComponent
        return (
          <StageUpload
            onLoaded={onSourceLoaded}
            showTestImageButton={SHOW_TEST_IMAGE_BUTTON}
            onUseTestImage={onUseTestImage}
            testImageError={testImageError}
          />
        )
      }

      if (stage === 'review' && source && StageReviewComponent) {
        const StageReview = StageReviewComponent
        return (
          <StageReview
            image={source.image}
            imageData={source.imageData}
            regions={regions}
            selectedId={selectedId}
            setRegions={setRegions}
            setSelectedId={setSelectedId}
            goNext={goNext}
            goBack={goBack}
          />
        )
      }

      if (stage === 'transparency' && source && StageTransparencyComponent) {
        const StageTransparency = StageTransparencyComponent
        return (
          <StageTransparency
            source={source}
            regions={regions}
            onAdjustCrop={onAdjustCrop}
            onNext={onTransparencyNext}
            onBack={onTransparencyBack}
          />
        )
      }

      if (stage === 'finalize' && StageFinalizeComponent) {
        // Build the filtered list of items the user kept. Skipped regions
        // never reach finalize; the component never sees them.
        const items: Array<{ regionId: string; result: TransparencyResult }> = []
        if (transparencyDecisions && transparencyResults) {
          for (const region of regions) {
            const decision = transparencyDecisions.get(region.id)
            const result = transparencyResults.get(region.id)
            if (decision === 'keep' && result) {
              items.push({ regionId: region.id, result })
            }
          }
        }
        const StageFinalize = StageFinalizeComponent
        return (
          <StageFinalize
            items={items}
            username={handle.props.username}
            uploadStickerUrl={handle.props.uploadStickerUrl}
            profileUrl={handle.props.profileUrl}
            stickersUrl={handle.props.stickersUrl}
            onBack={onFinalizeBack}
          />
        )
      }

      return (
        <div mix={placeholderStyle}>
          <p>unexpected state. <a href="/upload-sticker/batch">reload</a>.</p>
        </div>
      )
    }
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
  gap: '0.75rem',
})

const errorStyle = css({ color: PRIMARY_500, fontSize: '0.875rem' })

const btnStyle = css({
  background: 'transparent',
  color: LIGHT_500,
  border: `1px solid ${LIGHT_500}66`,
  borderRadius: '0.25rem',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '0.875rem',
  padding: '0.375rem 0.75rem',
  '&:hover': { borderColor: PRIMARY_500 },
})
