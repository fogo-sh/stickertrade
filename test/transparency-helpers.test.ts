import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  applyAlphaMask,
  imageDataToPngBlob,
  tensorToAlphaMask,
  trimTransparentAndPad,
} from '../app/assets/batch-upload-stickers/transparency.ts'

// Same `ImageData` polyfill pattern as `test/detect.test.ts`. Node 25's
// global lacks `ImageData`, but the production code only reads `data`,
// `width`, `height` — and `applyAlphaMask` / `trimTransparentAndPad`
// construct new `ImageData` via the constructor, so we install the
// polyfill globally before importing the helpers.
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

describe('applyAlphaMask', () => {
  it('preserves RGB and replaces alpha from the mask', () => {
    // 2×2 fully-opaque red. The output should keep the red channel
    // intact while alpha comes entirely from `alpha`.
    const crop = new ImageData(
      new Uint8ClampedArray([
        255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
      ]),
      2,
      2,
    )
    const alpha = new Uint8ClampedArray([0, 128, 200, 255])
    const out = applyAlphaMask(crop, alpha)

    assert.equal(out.width, 2)
    assert.equal(out.height, 2)
    // Alpha at byte offsets 3, 7, 11, 15
    assert.equal(out.data[3], 0)
    assert.equal(out.data[7], 128)
    assert.equal(out.data[11], 200)
    assert.equal(out.data[15], 255)
    // R at byte offset 0 should still be 255
    assert.equal(out.data[0], 255)
    // G at byte offset 1 should still be 0
    assert.equal(out.data[1], 0)
    // The output buffer should be a fresh copy, not the input buffer
    assert.notStrictEqual(out.data, crop.data)
  })

  it('throws when the mask length does not match the crop dimensions', () => {
    const crop = new ImageData(new Uint8ClampedArray(2 * 2 * 4), 2, 2)
    const wrongAlpha = new Uint8ClampedArray(3) // should be 4
    assert.throws(() => applyAlphaMask(crop, wrongAlpha), /alpha\.length/)
  })
})

describe('trimTransparentAndPad', () => {
  it('trims fully-transparent borders and adds the requested padding', () => {
    // 10×10 image with a 4×4 opaque red square at (3,3).
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

    // bbox is 4×4, padding 8 each side → 20×20.
    assert.equal(out.width, 4 + 16)
    assert.equal(out.height, 4 + 16)

    // The first opaque source pixel was at (3,3); after trim it's at
    // (0,0) in the bbox, then shifted by +pad → output (8, 8).
    const idx = (8 * out.width + 8) * 4
    assert.equal(out.data[idx], 255)
    assert.equal(out.data[idx + 1], 0)
    assert.equal(out.data[idx + 2], 0)
    assert.equal(out.data[idx + 3], 255)

    // A pixel just outside the padded square (in the padding region)
    // should be fully transparent.
    const padIdx = (0 * out.width + 0) * 4
    assert.equal(out.data[padIdx + 3], 0)
  })

  it('returns the input unchanged when every pixel is fully transparent', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4) // all zeros
    const img = new ImageData(data, 4, 4)
    const out = trimTransparentAndPad(img, 8)
    assert.equal(out.width, 4)
    assert.equal(out.height, 4)
    // Returning the same instance is the contract we get from the
    // implementation's early return; that's fine.
    assert.strictEqual(out, img)
  })
})

describe('tensorToAlphaMask', () => {
  it('bilinearly resamples a 2×2 tensor to 4×4 with corner fidelity', () => {
    // 2×2 input:  0 1
    //             1 0
    // Output corners should match the input corners exactly because
    // bilinear sampling at the boundary lands on the source pixel.
    const tensor = new Float32Array([0, 1, 1, 0])
    const out = tensorToAlphaMask(tensor, 2, 2, 4, 4)

    assert.equal(out.length, 16)
    // corners: (0,0)=0, (0,3)=1*255=255, (3,0)=1*255=255, (3,3)=0
    assert.equal(out[0], 0)
    assert.equal(out[3], 255)
    assert.equal(out[12], 255) // row 3, col 0 → index 12
    assert.equal(out[15], 0)

    // The output centre samples a region of the saddle near 0.5 →
    // approximately 128. Bilinear on a 4-pixel saddle gives values
    // close to 128 but with non-trivial discretization (the spec
    // allows ±30 tolerance).
    assert.ok(
      Math.abs(out[5]! - 128) < 30,
      `expected out[5] ≈ 128, got ${out[5]}`,
    )
  })

  it('upsamples a monotone gradient and preserves monotonicity', () => {
    // 4×1 input: 0, 0.33, 0.66, 1.  Expanded to 16×1 the output should
    // be non-decreasing along the row.
    const tensor = new Float32Array([0, 1 / 3, 2 / 3, 1])
    const out = tensorToAlphaMask(tensor, 4, 1, 16, 1)
    assert.equal(out.length, 16)
    for (let i = 1; i < out.length; i++) {
      assert.ok(
        out[i]! >= out[i - 1]!,
        `expected monotone non-decreasing, got out[${i - 1}]=${out[i - 1]} > out[${i}]=${out[i]}`,
      )
    }
    // First sample should be 0, last sample should be 255.
    assert.equal(out[0], 0)
    assert.equal(out[15], 255)
  })

  it('handles a degenerate identity resize without crashing', () => {
    const tensor = new Float32Array([0, 0.5, 1, 0.25])
    const out = tensorToAlphaMask(tensor, 2, 2, 2, 2)
    assert.equal(out.length, 4)
    assert.equal(out[0], 0)
    assert.equal(out[1], Math.round(0.5 * 255))
    assert.equal(out[2], Math.round(1 * 255))
    assert.equal(out[3], Math.round(0.25 * 255))
  })
})

describe('imageDataToPngBlob', () => {
  // The implementation requires either `OffscreenCanvas` or `document`.
  // Under `node:test` neither exists, and mocking the full Canvas2D API
  // adds noise without meaningful coverage. We just import the symbol
  // so the module's exports type-check and parse, then assert that
  // calling it without a browser surfaces a sensible error rather than
  // silently hanging.
  it('is exported and rejects with a clear message in non-browser env', async () => {
    assert.equal(typeof imageDataToPngBlob, 'function')
    const stub = new ImageData(new Uint8ClampedArray(1 * 1 * 4), 1, 1)
    await assert.rejects(
      async () => imageDataToPngBlob(stub),
      /OffscreenCanvas|document/,
      'expected a browser-API error message',
    )
  })
})
