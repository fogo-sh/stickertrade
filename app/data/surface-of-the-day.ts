import type { Database } from 'remix/data-table'

import { surfaces, surfaceFeatures, type Surface } from './schema.ts'

/**
 * Lazy daily-pick algorithm with full-rotation history. The first request of
 * the UTC day persists a chosen surface to `surface_features`; subsequent
 * requests reuse that cached row.
 *
 * Selection rules:
 *   1. Surfaces that have never been featured are picked first (random
 *      among them). This means newly uploaded surfaces always lead the
 *      next pick.
 *   2. Once every surface has been featured at least once, fall back to the
 *      least-recently-featured surface, breaking ties at random. This keeps
 *      the rotation cycling fairly even on small libraries.
 *
 * Race-safe: `featured_date` has a UNIQUE constraint, so concurrent
 * first-of-day requests can't write two rows — the loser catches the error
 * and re-reads. If the cached pick has since been deleted (FK cascade
 * usually handles this; the FK-bypass case is handled explicitly), the
 * stale row is dropped and a fresh pick is rolled.
 *
 * `today` is exposed only so tests can simulate consecutive days without
 * touching the system clock.
 */
export async function getSurfaceOfTheDay(
  db: Database,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<Surface | null> {
  // 1. Did we already pick today?
  const existing = await db.findOne(surfaceFeatures, {
    where: { featured_date: today },
  })
  if (existing) {
    const surface = await db.findOne(surfaces, { where: { id: existing.surface_id } })
    if (surface) return surface
    // Surface was deleted after being picked. Drop the stale feature row
    // and fall through to re-roll.
    await db.delete(surfaceFeatures, existing.id)
  }

  const chosen = await chooseSurface(db)
  if (!chosen) return null

  // Persist. UNIQUE on featured_date prevents concurrent double-writes.
  try {
    await db.create(surfaceFeatures, {
      surface_id: chosen.id,
      featured_date: today,
      created_at: Date.now(),
    })
    return chosen
  } catch (err) {
    // Lost the race? Re-read whatever the winning request wrote. If
    // there's no winner row, the original error wasn't a race — re-throw.
    const winner = await db.findOne(surfaceFeatures, {
      where: { featured_date: today },
    })
    if (!winner) throw err
    return db.findOne(surfaces, { where: { id: winner.surface_id } })
  }
}

/**
 * Picks the next surface to feature. Prefers never-featured surfaces; if
 * every surface has been featured at least once, picks at random from the
 * surfaces tied for the oldest most-recent feature date.
 *
 * Returns `null` only when there are no surfaces at all.
 */
async function chooseSurface(db: Database): Promise<Surface | null> {
  const allSurfaces = await db.findMany(surfaces, {})
  if (allSurfaces.length === 0) return null

  const features = await db.findMany(surfaceFeatures, {})

  // Build surface_id -> most-recent featured_date map. featured_date is an
  // ISO YYYY-MM-DD string, so lexicographic comparison matches calendar order.
  const lastFeaturedAt = new Map<string, string>()
  for (const feature of features) {
    const prev = lastFeaturedAt.get(feature.surface_id)
    if (prev === undefined || feature.featured_date > prev) {
      lastFeaturedAt.set(feature.surface_id, feature.featured_date)
    }
  }

  // Prefer surfaces that have never been featured.
  const neverFeatured = allSurfaces.filter((s) => !lastFeaturedAt.has(s.id))
  if (neverFeatured.length > 0) {
    return pickRandom(neverFeatured)
  }

  // Everyone's been featured. Pick from the surfaces tied for the oldest
  // most-recent feature date.
  let oldest: string | undefined
  for (const s of allSurfaces) {
    const last = lastFeaturedAt.get(s.id)!
    if (oldest === undefined || last < oldest) oldest = last
  }
  const oldestTier = allSurfaces.filter((s) => lastFeaturedAt.get(s.id) === oldest)
  return pickRandom(oldestTier)
}

function pickRandom<T>(items: readonly T[]): T {
  const offset = Math.floor(Math.random() * items.length)
  // items.length >= 1 by construction at every call site.
  return items[offset]!
}
