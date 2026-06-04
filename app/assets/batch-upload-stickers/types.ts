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
