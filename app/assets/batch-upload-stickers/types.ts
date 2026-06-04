/**
 * Shared types for the batch sticker upload flow.
 */

export interface Region {
  id: string
  x: number
  y: number
  width: number
  height: number
  score: number
}

export type Stage = 'upload' | 'review' | 'transparency' | 'finalize'

/**
 * Decoded source photo: the drawable `HTMLImageElement` for the canvas
 * and the raw `ImageData` that the detector reads. Width/height are kept
 * alongside as a convenience so callers don't need to dereference the
 * image for naturalWidth/naturalHeight.
 */
export interface SourceImage {
  image: HTMLImageElement
  imageData: ImageData
  width: number
  height: number
}
