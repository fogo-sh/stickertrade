import type { SurfaceImage } from './schema.ts'

/**
 * Sort surface images: primary first, then by created_at ASC.
 * Returns a new array; does not mutate the input.
 *
 * `db.findMany` `orderBy` only accepts a single `[col, dir]` tuple in this
 * codebase, so the secondary sort happens in JS. The list is at most 8 rows
 * (MAX_GALLERY_FILES) per surface.
 */
export function sortGalleryImages<
  T extends { is_primary: unknown; created_at: number },
>(images: T[]): T[] {
  return [...images].sort((a, b) => {
    const aPrimary = Boolean(a.is_primary)
    const bPrimary = Boolean(b.is_primary)
    if (aPrimary !== bPrimary) return aPrimary ? -1 : 1
    return a.created_at - b.created_at
  })
}
