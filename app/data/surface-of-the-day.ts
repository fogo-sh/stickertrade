import type { Database } from 'remix/data-table'

import { surfaces, surfaceFeatures, type Surface } from './schema.ts'

/**
 * Lazy daily-pick algorithm. First request of the UTC day persists a
 * randomly chosen surface to `surface_features`; subsequent requests
 * read the cached row. If the cached pick has since been deleted, the
 * stale row is dropped and a fresh pick is rolled.
 *
 * Race-safe: `featured_date` has a UNIQUE constraint, so concurrent
 * first-of-day requests can't write two rows — the loser catches the
 * error and re-reads.
 */
export async function getSurfaceOfTheDay(db: Database): Promise<Surface | null> {
  const todayUtc = new Date().toISOString().slice(0, 10)

  // 1. Did we already pick today?
  const existing = await db.findOne(surfaceFeatures, {
    where: { featured_date: todayUtc },
  })
  if (existing) {
    const surface = await db.findOne(surfaces, { where: { id: existing.surface_id } })
    if (surface) return surface
    // Surface was deleted after being picked. Drop the stale feature row
    // and fall through to re-roll.
    await db.delete(surfaceFeatures, existing.id)
  }

  // 2. Roll.
  const total = await db.count(surfaces)
  if (total === 0) return null

  const offset = Math.floor(Math.random() * total)
  const rolled = await db.query(surfaces).limit(1).offset(offset).all()
  const chosen = rolled[0]
  if (!chosen) return null

  // 3. Persist. UNIQUE on featured_date prevents concurrent double-writes.
  try {
    await db.create(surfaceFeatures, {
      surface_id: chosen.id,
      featured_date: todayUtc,
      created_at: Date.now(),
    })
    return chosen
  } catch {
    // Lost the race. Re-read whatever the winning request wrote.
    const winner = await db.findOne(surfaceFeatures, {
      where: { featured_date: todayUtc },
    })
    if (!winner) return null
    return db.findOne(surfaces, { where: { id: winner.surface_id } })
  }
}
