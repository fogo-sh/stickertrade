import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { detectRegions } from '../app/assets/batch-upload-stickers/detect.ts'

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
 * Adds light per-channel noise (±amplitude) to make synthetic fixtures behave
 * a little more like real photos. Without noise, flat-color rectangles can
 * trip the contrast pipeline's `normalize 0-255` step in pathological ways.
 */
function addNoise(img: ImageData, amplitude: number): void {
  for (let i = 0; i < img.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const delta = Math.round((Math.random() - 0.5) * 2 * amplitude)
      const v = img.data[i + c]! + delta
      img.data[i + c] = Math.max(0, Math.min(255, v))
    }
  }
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
