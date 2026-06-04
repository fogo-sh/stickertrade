import type { Region } from './types.ts'

export type { Region } from './types.ts'

/**
 * Pure-JS sticker bounding-box detector. TypeScript port of
 * `tmp/sticker-catalog/app/vision.py` (`_foreground_masks`,
 * `_regions_from_mask`, `_merge_overlapping`).
 *
 * Pipeline:
 *   1. downscale to max-dim 1600 (work-space)
 *   2. RGB → LAB + S (saturation only); other HSV channels unused
 *   3. sample the outer border to estimate background median + p96 distance
 *   4. build a color mask (LAB distance > threshold) | saturation mask
 *      → median-blur 5×5 → open 3×3 → close 9×9
 *   5. build a contrast mask: gray → 3× box-blur (σ≈25) → |diff| → normalize
 *      (NORM_MINMAX) → threshold 35 → open 3×3 → close 13×13 (×2)
 *   6. connected components (4-conn, two-pass union-find) on each mask
 *   7. filter regions (area, min dim, max bbox area, aspect, fill ratio)
 *   8. pad bboxes 4%, scale back to source coordinates
 *   9. merge across masks (overlap_area / smaller_area > 0.35)
 *  10. sort by (y, x), assign 8-char ids
 *
 * Target: <300ms on a 900×600 fixture on a dev machine.
 */
export function detectRegions(imageData: ImageData): Region[] {
  const { data, width: srcW, height: srcH } = imageData

  // Image must be plausibly large enough to contain >= one 32×32 region with
  // a sampling border on all sides. The Python tool implicitly required this
  // by virtue of min-dim filters; we short-circuit on tiny inputs.
  if (srcW < 64 || srcH < 64) return []

  // 1. Downscale.
  const maxDim = Math.max(srcW, srcH)
  const scale = maxDim > 1600 ? 1600 / maxDim : 1
  const work = scale < 1 ? downscale(data, srcW, srcH, scale) : { data, width: srcW, height: srcH }
  const w = work.width
  const h = work.height
  const wd = work.data
  const npx = w * h

  // 2. Build LAB + S arrays in a single pass.
  const L = new Float32Array(npx)
  const A = new Float32Array(npx)
  const B = new Float32Array(npx)
  const S = new Uint8Array(npx)
  const gray = new Uint8Array(npx)
  for (let i = 0, p = 0; i < npx; i++, p += 4) {
    const r = wd[p]!
    const g = wd[p + 1]!
    const b = wd[p + 2]!
    const lab = rgbToLab(r, g, b)
    L[i] = lab[0]
    A[i] = lab[1]
    B[i] = lab[2]
    S[i] = rgbToS(r, g, b)
    // Luma (rec 601) — matches OpenCV's BGR2GRAY behavior closely enough.
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }

  // 3. Border sampling.
  const border = Math.max(8, Math.floor(Math.min(w, h) / 30))
  const borderIdx = collectBorderIndices(w, h, border)
  const bgL = medianAt(L, borderIdx)
  const bgA = medianAt(A, borderIdx)
  const bgB = medianAt(B, borderIdx)

  // Border distances to background (used for p96 threshold).
  const borderDist = new Float64Array(borderIdx.length)
  for (let i = 0; i < borderIdx.length; i++) {
    const idx = borderIdx[i]!
    const dl = L[idx]! - bgL
    const da = A[idx]! - bgA
    const db = B[idx]! - bgB
    borderDist[i] = Math.sqrt(dl * dl + da * da + db * db)
  }
  const distThreshold = Math.max(24, percentile(borderDist, 0.96) + 8)

  // Border saturations for the saturation threshold.
  const borderSat = new Float64Array(borderIdx.length)
  for (let i = 0; i < borderIdx.length; i++) borderSat[i] = S[borderIdx[i]!]!
  const satThreshold = Math.max(55, percentile(borderSat, 0.96) + 24)

  // 4. Color mask.
  const colorMask = new Uint8Array(npx)
  for (let i = 0; i < npx; i++) {
    const dl = L[i]! - bgL
    const da = A[i]! - bgA
    const db = B[i]! - bgB
    const d = Math.sqrt(dl * dl + da * da + db * db)
    if (d > distThreshold || S[i]! > satThreshold) colorMask[i] = 255
  }

  medianBlur5x5(colorMask, w, h)
  morphOpen3x3(colorMask, w, h)
  morphClose(colorMask, w, h, 9)

  // 5. Contrast mask: blur → abs diff → normalize → threshold → open/close.
  const blurred = new Uint8Array(gray)
  // 3 passes of radius-25 box blur ≈ Gaussian σ≈25.5 (σ² ≈ 3·(2·25+1)²/12).
  for (let pass = 0; pass < 3; pass++) boxBlur(blurred, w, h, 25)

  const diff = new Uint8Array(npx)
  let maxDiff = 0
  let minDiff = 255
  for (let i = 0; i < npx; i++) {
    const d = Math.abs(gray[i]! - blurred[i]!)
    diff[i] = d
    if (d > maxDiff) maxDiff = d
    if (d < minDiff) minDiff = d
  }
  // OpenCV NORM_MINMAX: rescale [min, max] → [0, 255], then threshold > 35.
  const contrastMask = new Uint8Array(npx)
  if (maxDiff > minDiff) {
    const range = maxDiff - minDiff
    const scaleN = 255 / range
    for (let i = 0; i < npx; i++) {
      const n = (diff[i]! - minDiff) * scaleN
      if (n > 35) contrastMask[i] = 255
    }
  }
  morphOpen3x3(contrastMask, w, h)
  // Two passes of close 13×13 match `cv2.morphologyEx(MORPH_CLOSE, 13×13,
  // iterations=2)`. Iterated closes are NOT equivalent to a single larger
  // close — each pass dilates+erodes incrementally, filling progressively
  // larger holes without expanding the outer envelope as aggressively as a
  // single 25-radius close would. Keep both passes.
  morphClose(contrastMask, w, h, 13)
  morphClose(contrastMask, w, h, 13)

  // 6+7+8. Per-mask: connected components → filter → pad → scale-back.
  const inv = 1 / scale
  const candidates: Region[] = []
  for (const mask of [colorMask, contrastMask]) {
    const bboxes = connectedComponents(mask, w, h)
    for (const bb of bboxes) {
      const region = filterAndScale(bb, w, h, srcW, srcH, inv)
      if (region) candidates.push(region)
    }
  }

  // 9. Merge across both masks.
  const merged = mergeRegions(candidates)

  // 10. Sort by (y, x) and assign ids.
  merged.sort((a, b) => a.y - b.y || a.x - b.x)
  for (const r of merged) r.id = newId()

  return merged
}

// ---------------------------------------------------------------------------
// Downscale (nearest-neighbor; runs in O(target_pixels))
// ---------------------------------------------------------------------------

function downscale(
  data: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  scale: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const dstW = Math.max(1, Math.round(srcW * scale))
  const dstH = Math.max(1, Math.round(srcH * scale))
  const dst = new Uint8ClampedArray(dstW * dstH * 4)
  const inv = 1 / scale
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y * inv))
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x * inv))
      const si = (sy * srcW + sx) * 4
      const di = (y * dstW + x) * 4
      dst[di] = data[si]!
      dst[di + 1] = data[si + 1]!
      dst[di + 2] = data[si + 2]!
      dst[di + 3] = 255
    }
  }
  return { data: dst, width: dstW, height: dstH }
}

// ---------------------------------------------------------------------------
// Color conversion (inline, no library)
// ---------------------------------------------------------------------------

// sRGB → linear curve, sRGB(D65) → XYZ → LAB. Reference white D65.
const XN = 95.047
const YN = 100.0
const ZN = 108.883

function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function fLab(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  // sRGB → XYZ (D65)
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) * 100
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175) * 100
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) * 100
  const fx = fLab(x / XN)
  const fy = fLab(y / YN)
  const fz = fLab(z / ZN)
  const L = 116 * fy - 16
  const A = 500 * (fx - fy)
  const B = 200 * (fy - fz)
  return [L, A, B]
}

// Returns just the saturation channel (HSV-style 0-255).
function rgbToS(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  if (max === 0) return 0
  const min = Math.min(r, g, b)
  // OpenCV HSV S in 8-bit mode is (max - min) / max * 255
  return Math.round(((max - min) / max) * 255)
}

// ---------------------------------------------------------------------------
// Border + percentile + median
// ---------------------------------------------------------------------------

function collectBorderIndices(w: number, h: number, border: number): Int32Array {
  const b = Math.min(border, Math.floor(Math.min(w, h) / 2))
  // top + bottom rows + left/right side strips (excluding corners already counted)
  const topBottom = 2 * b * w
  const sides = 2 * b * (h - 2 * b)
  const out = new Int32Array(topBottom + sides)
  let k = 0
  // top
  for (let y = 0; y < b; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) out[k++] = row + x
  }
  // bottom
  for (let y = h - b; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) out[k++] = row + x
  }
  // left
  for (let y = b; y < h - b; y++) {
    const row = y * w
    for (let x = 0; x < b; x++) out[k++] = row + x
  }
  // right
  for (let y = b; y < h - b; y++) {
    const row = y * w
    for (let x = w - b; x < w; x++) out[k++] = row + x
  }
  return out
}

function medianAt(channel: Float32Array, indices: Int32Array): number {
  const buf = new Float64Array(indices.length)
  for (let i = 0; i < indices.length; i++) buf[i] = channel[indices[i]!]!
  buf.sort()
  const mid = buf.length >> 1
  return buf.length % 2 === 0 ? (buf[mid - 1]! + buf[mid]!) / 2 : buf[mid]!
}

function percentile(buf: Float64Array, p: number): number {
  if (buf.length === 0) return 0
  const sorted = buf.slice()
  sorted.sort()
  const idx = p * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  const frac = idx - lo
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac
}

// ---------------------------------------------------------------------------
// Morphology (binary masks 0/255)
// ---------------------------------------------------------------------------

function medianBlur5x5(mask: Uint8Array, w: number, h: number): void {
  // Matches `cv2.medianBlur(color, 5)` in vision.py. For a binary mask, the
  // median is just the majority bit in the window — `count * 2 > total`.
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let count = 0
      const x0 = Math.max(0, x - 2)
      const x1 = Math.min(w - 1, x + 2)
      const y0 = Math.max(0, y - 2)
      const y1 = Math.min(h - 1, y + 2)
      let total = 0
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * w
        for (let xx = x0; xx <= x1; xx++) {
          if (mask[row + xx]! > 0) count++
          total++
        }
      }
      out[y * w + x] = count * 2 > total ? 255 : 0
    }
  }
  mask.set(out)
}

function morphOpen3x3(mask: Uint8Array, w: number, h: number): void {
  // open = erode then dilate
  erode(mask, w, h, 1)
  dilate(mask, w, h, 1)
}

function morphClose(mask: Uint8Array, w: number, h: number, kernel: number): void {
  const r = Math.floor(kernel / 2)
  dilate(mask, w, h, r)
  erode(mask, w, h, r)
}

/**
 * Separable rectangular erosion: 0 if ANY pixel in the (2r+1) window is 0.
 * Sliding-min via a monotonic deque per pass, O(n).
 *
 * Exported for the brute-force regression test in `test/detect.test.ts`;
 * do not call from production code outside `detect.ts`.
 */
export function _erode_TESTING(mask: Uint8Array, w: number, h: number, r: number): void {
  slidingExtreme(mask, w, h, r, true)
}

/** See `_erode_TESTING`. */
export function _dilate_TESTING(mask: Uint8Array, w: number, h: number, r: number): void {
  slidingExtreme(mask, w, h, r, false)
}

function erode(mask: Uint8Array, w: number, h: number, r: number): void {
  slidingExtreme(mask, w, h, r, true)
}

function dilate(mask: Uint8Array, w: number, h: number, r: number): void {
  slidingExtreme(mask, w, h, r, false)
}

function slidingExtreme(
  mask: Uint8Array,
  w: number,
  h: number,
  r: number,
  isMin: boolean,
): void {
  // Horizontal then vertical pass. Each pass uses a monotonic deque to track
  // the running min/max in O(n) per row/column.
  const tmp = new Uint8Array(mask.length)
  const deque = new Int32Array(Math.max(w, h))
  const better = isMin ? (a: number, b: number) => a <= b : (a: number, b: number) => a >= b

  // horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w
    let head = 0
    let tail = 0
    for (let x = 0; x < w + r; x++) {
      if (x < w) {
        const v = mask[row + x]!
        while (head < tail && better(v, mask[row + deque[tail - 1]!]!)) tail--
        deque[tail++] = x
      }
      // Centered window of radius r over inputs [ox-r, ox+r] where ox = x-r,
      // i.e. the deque must hold positions in [x-2r, x]. Eviction threshold is
      // x - 2*r, NOT x - r (the latter is a right-biased window of size r+1).
      while (head < tail && deque[head]! < x - 2 * r) head++
      const ox = x - r
      if (ox >= 0) tmp[row + ox] = mask[row + deque[head]!]!
    }
  }

  // vertical
  for (let x = 0; x < w; x++) {
    let head = 0
    let tail = 0
    for (let y = 0; y < h + r; y++) {
      if (y < h) {
        const v = tmp[y * w + x]!
        while (head < tail && better(v, tmp[deque[tail - 1]! * w + x]!)) tail--
        deque[tail++] = y
      }
      while (head < tail && deque[head]! < y - 2 * r) head++
      const oy = y - r
      if (oy >= 0) mask[oy * w + x] = tmp[deque[head]! * w + x]!
    }
  }
}

// ---------------------------------------------------------------------------
// Box blur (separable, 3-pass for ~Gaussian)
// ---------------------------------------------------------------------------

function boxBlur(channel: Uint8Array, w: number, h: number, r: number): void {
  const tmp = new Uint8Array(channel.length)
  // horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    let count = 0
    // prime with [0, r]
    for (let x = 0; x <= r && x < w; x++) {
      sum += channel[row + x]!
      count++
    }
    for (let x = 0; x < w; x++) {
      const right = x + r
      const left = x - r - 1
      if (right < w && x > 0) {
        sum += channel[row + right]!
        count++
      }
      if (left >= 0) {
        sum -= channel[row + left]!
        count--
      }
      tmp[row + x] = Math.round(sum / count)
    }
  }
  // vertical
  for (let x = 0; x < w; x++) {
    let sum = 0
    let count = 0
    for (let y = 0; y <= r && y < h; y++) {
      sum += tmp[y * w + x]!
      count++
    }
    for (let y = 0; y < h; y++) {
      const bot = y + r
      const top = y - r - 1
      if (bot < h && y > 0) {
        sum += tmp[bot * w + x]!
        count++
      }
      if (top >= 0) {
        sum -= tmp[top * w + x]!
        count--
      }
      channel[y * w + x] = Math.round(sum / count)
    }
  }
}

// ---------------------------------------------------------------------------
// Connected components (4-connectivity, two-pass union-find)
// ---------------------------------------------------------------------------

interface RawBBox {
  x: number
  y: number
  w: number
  h: number
  area: number
}

function connectedComponents(mask: Uint8Array, w: number, h: number): RawBBox[] {
  const labels = new Int32Array(mask.length)
  // DSU parent — provisional labels start at 1; index 0 unused.
  let parent = new Int32Array(1024)
  let nextLabel = 1
  parent[0] = 0

  function ensureCap(n: number) {
    if (n < parent.length) return
    let newLen = parent.length
    while (newLen <= n) newLen *= 2
    const p = new Int32Array(newLen)
    p.set(parent)
    parent = p
  }

  function find(x: number): number {
    while (parent[x]! !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }

  function union(a: number, b: number): number {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return ra
    if (ra < rb) {
      parent[rb] = ra
      return ra
    } else {
      parent[ra] = rb
      return rb
    }
  }

  // first pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (mask[idx]! === 0) continue
      const left = x > 0 ? labels[idx - 1]! : 0
      const up = y > 0 ? labels[idx - w]! : 0
      if (left === 0 && up === 0) {
        ensureCap(nextLabel)
        parent[nextLabel] = nextLabel
        labels[idx] = nextLabel
        nextLabel++
      } else if (left !== 0 && up === 0) {
        labels[idx] = left
      } else if (left === 0 && up !== 0) {
        labels[idx] = up
      } else {
        labels[idx] = union(left, up)
      }
    }
  }

  // second pass: accumulate bboxes per root
  const minX = new Map<number, number>()
  const minY = new Map<number, number>()
  const maxX = new Map<number, number>()
  const maxY = new Map<number, number>()
  const areas = new Map<number, number>()

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const l = labels[idx]!
      if (l === 0) continue
      const root = find(l)
      labels[idx] = root
      if (!areas.has(root)) {
        minX.set(root, x)
        minY.set(root, y)
        maxX.set(root, x)
        maxY.set(root, y)
        areas.set(root, 1)
      } else {
        if (x < minX.get(root)!) minX.set(root, x)
        if (y < minY.get(root)!) minY.set(root, y)
        if (x > maxX.get(root)!) maxX.set(root, x)
        if (y > maxY.get(root)!) maxY.set(root, y)
        areas.set(root, areas.get(root)! + 1)
      }
    }
  }

  const out: RawBBox[] = []
  for (const [root, area] of areas) {
    const x0 = minX.get(root)!
    const y0 = minY.get(root)!
    const x1 = maxX.get(root)!
    const y1 = maxY.get(root)!
    out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area })
  }
  return out
}

// ---------------------------------------------------------------------------
// Filter + pad + scale-back
// ---------------------------------------------------------------------------

function filterAndScale(
  bb: RawBBox,
  maskW: number,
  maskH: number,
  srcW: number,
  srcH: number,
  inv: number,
): Region | null {
  const maskSize = maskW * maskH
  const minArea = Math.max(900, maskSize * 0.001)
  const maxBboxArea = maskSize * 0.1

  if (bb.area < minArea) return null
  if (bb.w < 32 || bb.h < 32) return null
  if (bb.w * bb.h > maxBboxArea) return null
  const aspect = bb.w / bb.h
  if (aspect < 0.12 || aspect > 8.0) return null
  const fill = bb.area / Math.max(1, bb.w * bb.h)
  if (fill < 0.08) return null

  const pad = Math.max(6, Math.round(Math.max(bb.w, bb.h) * 0.04))
  let x = Math.max(0, bb.x - pad)
  let y = Math.max(0, bb.y - pad)
  let pw = Math.min(maskW - x, bb.w + pad * 2)
  let ph = Math.min(maskH - y, bb.h + pad * 2)

  // Scale back to source coordinates.
  const rx = Math.max(0, Math.round(x * inv))
  const ry = Math.max(0, Math.round(y * inv))
  const rw = Math.min(srcW - rx, Math.round(pw * inv))
  const rh = Math.min(srcH - ry, Math.round(ph * inv))

  const score = Math.min(1, Math.max(0, 0.45 + fill))
  return { id: '', x: rx, y: ry, width: rw, height: rh, score }
}

// ---------------------------------------------------------------------------
// Merge overlapping regions
// ---------------------------------------------------------------------------

function mergeRegions(regions: Region[]): Region[] {
  const pending = regions.slice()
  const merged: Region[] = []
  while (pending.length > 0) {
    let current = pending.shift()!
    let changed = true
    while (changed) {
      changed = false
      const rest: Region[] = []
      for (const other of pending) {
        if (overlapsOrTouches(current, other)) {
          current = union(current, other)
          changed = true
        } else {
          rest.push(other)
        }
      }
      pending.length = 0
      for (const r of rest) pending.push(r)
    }
    merged.push(current)
  }
  return merged
}

function overlapsOrTouches(a: Region, b: Region): boolean {
  const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  const overlapArea = ox * oy
  if (overlapArea === 0) return false
  const smaller = Math.min(a.width * a.height, b.width * b.height)
  return overlapArea / smaller > 0.35
}

function union(a: Region, b: Region): Region {
  const x1 = Math.min(a.x, b.x)
  const y1 = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.width, b.x + b.width)
  const y2 = Math.max(a.y + a.height, b.y + b.height)
  return {
    id: a.id,
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    score: Math.max(a.score, b.score),
  }
}

// ---------------------------------------------------------------------------
// Id generation
// ---------------------------------------------------------------------------

function newId(): string {
  // crypto.randomUUID is available in Node 20+ and all modern browsers.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().slice(0, 8)
  // Fallback: very unlikely to be hit, but keep the API total.
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0')
}
