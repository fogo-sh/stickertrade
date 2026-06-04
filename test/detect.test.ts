import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  _dilate_TESTING,
  _erode_TESTING,
  detectRegions,
} from '../app/assets/batch-upload-stickers/detect.ts'

// Node 25 doesn't expose ImageData as a global (it's a Web API). Provide a
// minimal polyfill so detect.ts — which only reads `data`, `width`, `height`
// — can be exercised under `node:test`. The real browser type is structurally
// compatible.
if (typeof (globalThis as { ImageData?: unknown }).ImageData === 'undefined') {
  class ImageDataPolyfill {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: 'srgb' = 'srgb'
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
  ;(globalThis as { ImageData?: unknown }).ImageData = ImageDataPolyfill
}

function makeImageData(
  width: number,
  height: number,
  fill: [number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0]
    data[i * 4 + 1] = fill[1]
    data[i * 4 + 2] = fill[2]
    data[i * 4 + 3] = 255
  }
  return new ImageData(data, width, height)
}

function fillRect(
  img: ImageData,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number],
): void {
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

/**
 * Deterministic LCG so the synthetic test isn't flaky. Seed picked once;
 * no need to expose. Mulberry32 — good enough for ±3 noise per pixel.
 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Adds light per-channel noise (±amplitude) to make synthetic fixtures behave
 * a little more like real photos. Without noise, flat-color rectangles can
 * trip the contrast pipeline's `normalize 0-255` step in pathological ways.
 */
function addNoise(img: ImageData, amplitude: number, seed = 0xc0ffee): void {
  const rng = makeRng(seed)
  for (let i = 0; i < img.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const delta = Math.round((rng() - 0.5) * 2 * amplitude)
      const v = img.data[i + c]! + delta
      img.data[i + c] = Math.max(0, Math.min(255, v))
    }
  }
}

/**
 * Brute-force reference for centered rectangular dilate/erode (max/min over
 * a (2r+1)×(2r+1) window with clamped borders). O(w·h·r²) — slow but obvious.
 */
function bruteExtreme(
  src: Uint8Array,
  w: number,
  h: number,
  r: number,
  isMin: boolean,
): Uint8Array {
  const out = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = isMin ? 255 : 0
      const y0 = Math.max(0, y - r)
      const y1 = Math.min(h - 1, y + r)
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const v = src[yy * w + xx]!
          if (isMin ? v < best : v > best) best = v
        }
      }
      out[y * w + x] = best
    }
  }
  return out
}

describe('detectRegions', () => {
  it('detects 3 distinct rectangles on a plain background', () => {
    const img = makeImageData(900, 600, [185, 178, 164])
    fillRect(img, 80, 80, 180, 150, [245, 246, 250])
    fillRect(img, 390, 120, 180, 180, [240, 80, 90])
    fillRect(img, 650, 330, 170, 170, [40, 42, 58])
    addNoise(img, 3)

    const regions = detectRegions(img)
    assert.equal(regions.length, 3, `expected 3 regions, got ${regions.length}`)
    assert.ok(
      regions.every((r) => r.width > 100 && r.height > 100),
      'each region should be reasonably sized',
    )
    // Every region should have a unique 8-char id
    const ids = new Set(regions.map((r) => r.id))
    assert.equal(ids.size, 3)
    for (const id of ids) {
      assert.equal(typeof id, 'string')
      assert.equal(id.length, 8)
    }
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

describe('morphology (dilate/erode sliding-window)', () => {
  // The sliding-window dilate/erode used to ship with a r+1 (right-biased)
  // window instead of the centered 2r+1 window the pipeline expects. The bug
  // shifted every morph output by r pixels and broke hole-filling. This
  // regression test pins the centered semantics across several radii.
  const W = 32
  const H = 16

  function randomMask(seed: number): Uint8Array {
    const rng = makeRng(seed)
    const out = new Uint8Array(W * H)
    for (let i = 0; i < out.length; i++) out[i] = rng() < 0.3 ? 255 : 0
    return out
  }

  for (const r of [1, 2, 3, 5, 7]) {
    it(`dilate(r=${r}) matches brute force`, () => {
      const seed = 0x12345 + r
      const src = randomMask(seed)
      const actual = src.slice()
      _dilate_TESTING(actual, W, H, r)
      const expected = bruteExtreme(src, W, H, r, false)
      assert.deepEqual(Array.from(actual), Array.from(expected))
    })

    it(`erode(r=${r}) matches brute force`, () => {
      const seed = 0x98765 + r
      const src = randomMask(seed)
      const actual = src.slice()
      _erode_TESTING(actual, W, H, r)
      const expected = bruteExtreme(src, W, H, r, true)
      assert.deepEqual(Array.from(actual), Array.from(expected))
    })
  }

  it('dilate(r=1) of an isolated pixel produces a 3x3 plus pattern', () => {
    // sanity check that the centered window is actually centered
    const src = new Uint8Array(5 * 5)
    src[2 * 5 + 2] = 255
    _dilate_TESTING(src, 5, 5, 1)
    // A separable (rectangular SE) dilate fills the full 3×3 square, not just
    // the cross — every pixel in [1,3]×[1,3] should be 255.
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        assert.equal(src[y * 5 + x], 255, `expected 255 at (${x},${y})`)
      }
    }
    // Corners outside the square should be 0
    assert.equal(src[0], 0)
    assert.equal(src[4 * 5 + 4], 0)
  })

  it('close(r=2) fills a 4-pixel gap between two vertical lines', () => {
    // Two vertical bars of length 5 separated by 4 empty columns.
    const W2 = 14
    const H2 = 8
    const src = new Uint8Array(W2 * H2)
    for (let y = 1; y <= 5; y++) {
      src[y * W2 + 3] = 255
      src[y * W2 + 8] = 255
    }
    const mask = src.slice()
    _dilate_TESTING(mask, W2, H2, 2)
    _erode_TESTING(mask, W2, H2, 2)
    // After a close(r=2), the columns between (inclusive) should now be filled
    // for the rows in [3..3] (the centered window of size 5 covers ±2 from the
    // midline). Spot check the midline at y=3.
    for (let x = 3; x <= 8; x++) {
      assert.equal(mask[3 * W2 + x], 255, `gap at (${x},3) not closed`)
    }
  })
})
