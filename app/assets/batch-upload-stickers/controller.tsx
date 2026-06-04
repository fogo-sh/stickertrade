import { clientEntry, css, on, type Handle } from 'remix/ui'

import type { StageReview as StageReviewType } from './stage-review.tsx'
import type { StageUpload as StageUploadType } from './stage-upload.tsx'
import type { Region, SourceImage, Stage } from './types.ts'

// Theme colors inlined: app/ui/theme.ts is outside the asset server's allow
// list. The hex values match the `light.500`, `primary.500`, and `dark.500`
// tokens in `app/ui/theme.ts`.
const LIGHT_500 = '#f1eee4'
const PRIMARY_500 = '#f7a1c4'
const DARK_500 = '#1c0f13'

// Toggle for the synthetic-test-image dev affordance. Leaving it `true`
// through Task 4-7 keeps the canvas/transparency/finalize stages testable
// without a real photo on hand. Flip to `false` (or rip out the branch) in
// Task 8 once end-to-end verification is done.
const SHOW_TEST_IMAGE_BUTTON = true

// Type aliases for the dynamically-imported stage components.
type StageReviewFn = typeof StageReviewType
type StageUploadFn = typeof StageUploadType

/**
 * Client-side root for the batch sticker upload flow. Owns the stage state
 * machine (upload → review → transparency → finalize). Each stage's code is
 * lazy-imported so the first paint of this page only ships the controller and
 * a small placeholder.
 *
 * Task 4 wires the upload stage (real file picker + image decode). The
 * synthetic-test-image button is kept behind `SHOW_TEST_IMAGE_BUTTON` as a
 * dev affordance for exercising the canvas without a real photo —
 * scheduled for removal in Task 8 polish.
 *
 * Transparency / finalize stages are still stubbed pending Tasks 6-7.
 */
export const BatchUploadStickersApp = clientEntry(
  import.meta.url,
  function BatchUploadStickersApp(handle: Handle<{}>) {
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
        }
        // Tasks 6-7 will add transparency and finalize stages here.
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
      // Task 6 will wire transparency. For now stop here.
      // TODO: void loadStage('transparency')
    }

    function goBack(): void {
      // Soft reset back to the upload stage; the source image and regions
      // are preserved so the user can re-enter review without re-uploading.
      setStage('upload')
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
     * warm-gray background. Mirrors the fixture in `test/detect.test.ts` so
     * we can exercise the review stage end-to-end without a real photo file.
     * Used by the "Use synthetic test image" affordance when the optional
     * `/images/test-stickers.jpg` fixture is missing.
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
        // Try the optional /images/test-stickers.jpg fixture first. If it
        // 404s (which is the default state of this branch — no fixture has
        // been committed), fall back to synthetic geometry.
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

      if (stage === 'transparency' || stage === 'finalize') {
        return (
          <div mix={placeholderStyle}>
            <p>stage "{stage}" lands in a later task.</p>
            <button type="button" mix={[btnStyle, on('click', () => setStage('upload'))]}>
              back to upload
            </button>
          </div>
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
