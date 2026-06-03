import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { DatabaseSync } from 'node:sqlite'
import { createDatabase, type Database } from 'remix/data-table'
import { createSqliteDatabaseAdapter } from 'remix/data-table/sqlite'
import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'

import { surfaceImages, surfaces, surfaceFeatures, users } from '../app/data/schema.ts'
import { getSurfaceOfTheDay } from '../app/data/surface-of-the-day.ts'

interface TestEnv {
  db: Database
  sqlite: DatabaseSync
  tmpDir: string
}

async function makeEnv(): Promise<TestEnv> {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'stickertrade-sotd-test-'))
  const dbPath = path.join(tmpDir, 'sotd.sqlite')
  const sqlite = new DatabaseSync(dbPath)
  sqlite.exec('PRAGMA foreign_keys = ON')
  const adapter = createSqliteDatabaseAdapter(sqlite)
  const db = createDatabase(adapter)
  const migrations = await loadMigrations('./migrations')
  const runner = createMigrationRunner(adapter, migrations)
  await runner.up()
  return { db, sqlite, tmpDir }
}

function cleanup(env: TestEnv) {
  env.sqlite.close()
  rmSync(env.tmpDir, { recursive: true, force: true })
}

async function makeUser(env: TestEnv, username: string): Promise<string> {
  const id = randomUUID()
  const now = Date.now()
  await env.db.create(users, {
    id,
    username,
    role: 'USER',
    password_hash: 'hash',
    invitation_limit: 10,
    created_at: now,
    updated_at: now,
  })
  return id
}

async function makeSurface(env: TestEnv, ownerId: string, name: string): Promise<string> {
  const id = randomUUID()
  const now = Date.now()
  await env.db.transaction(async (tx) => {
    await tx.create(surfaces, {
      id,
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${id.slice(0, 6)}`,
      owner_id: ownerId,
      created_at: now,
      updated_at: now,
    })
    await tx.create(surfaceImages, {
      id: randomUUID(),
      surface_id: id,
      image_url: '/uploads/test.png',
      is_primary: true,
      created_at: now,
    })
  })
  return id
}

describe('getSurfaceOfTheDay', () => {
  it('returns null when there are no surfaces', async () => {
    const env = await makeEnv()
    try {
      const result = await getSurfaceOfTheDay(env.db)
      assert.equal(result, null)
    } finally {
      cleanup(env)
    }
  })

  it('picks and persists a surface on first call of the day', async () => {
    const env = await makeEnv()
    try {
      const ownerId = await makeUser(env, 'pickme')
      const surfaceId = await makeSurface(env, ownerId, 'My Laptop')

      const result = await getSurfaceOfTheDay(env.db)
      assert.ok(result)
      assert.equal(result.id, surfaceId)

      const today = new Date().toISOString().slice(0, 10)
      const feature = await env.db.findOne(surfaceFeatures, {
        where: { featured_date: today },
      })
      assert.ok(feature)
      assert.equal(feature.surface_id, surfaceId)
    } finally {
      cleanup(env)
    }
  })

  it('returns the cached pick on subsequent calls the same day', async () => {
    const env = await makeEnv()
    try {
      const ownerId = await makeUser(env, 'cached')
      await makeSurface(env, ownerId, 'First')
      await makeSurface(env, ownerId, 'Second')
      await makeSurface(env, ownerId, 'Third')

      const first = await getSurfaceOfTheDay(env.db)
      const second = await getSurfaceOfTheDay(env.db)
      const third = await getSurfaceOfTheDay(env.db)
      assert.ok(first && second && third)
      assert.equal(first.id, second.id)
      assert.equal(second.id, third.id)

      const count = await env.db.count(surfaceFeatures)
      assert.equal(count, 1)
    } finally {
      cleanup(env)
    }
  })

  it('re-rolls when the cached pick was deleted', async () => {
    const env = await makeEnv()
    try {
      const ownerId = await makeUser(env, 'deleter')
      const aId = await makeSurface(env, ownerId, 'Alpha')
      const bId = await makeSurface(env, ownerId, 'Beta')

      const today = new Date().toISOString().slice(0, 10)
      await env.db.create(surfaceFeatures, {
        surface_id: aId,
        featured_date: today,
        created_at: Date.now(),
      })

      await env.db.delete(surfaces, aId)

      const result = await getSurfaceOfTheDay(env.db)
      assert.ok(result)
      assert.equal(result.id, bId)

      const features = await env.db.findMany(surfaceFeatures, {})
      assert.equal(features.length, 1)
      assert.equal(features[0]!.surface_id, bId)
    } finally {
      cleanup(env)
    }
  })

  it('returns null after re-roll if no surfaces remain', async () => {
    const env = await makeEnv()
    try {
      const ownerId = await makeUser(env, 'lonely')
      const aId = await makeSurface(env, ownerId, 'Solo')

      const today = new Date().toISOString().slice(0, 10)
      await env.db.create(surfaceFeatures, {
        surface_id: aId,
        featured_date: today,
        created_at: Date.now(),
      })

      await env.db.delete(surfaces, aId)

      const result = await getSurfaceOfTheDay(env.db)
      assert.equal(result, null)
    } finally {
      cleanup(env)
    }
  })

  it('drops a stale feature row whose surface was deleted (FK-bypass case)', async () => {
    const env = await makeEnv()
    try {
      const ownerId = await makeUser(env, 'stale')
      const aId = await makeSurface(env, ownerId, 'GoneSurface')
      const bId = await makeSurface(env, ownerId, 'StillHere')

      const today = new Date().toISOString().slice(0, 10)
      await env.db.create(surfaceFeatures, {
        surface_id: aId,
        featured_date: today,
        created_at: Date.now(),
      })

      // Disable FK enforcement so we can leave the feature row orphaned.
      env.sqlite.exec('PRAGMA foreign_keys = OFF')
      env.sqlite.prepare('DELETE FROM surfaces WHERE id = ?').run(aId)
      env.sqlite.exec('PRAGMA foreign_keys = ON')

      // The feature row should still exist now (because we bypassed the cascade).
      const orphan = await env.db.findOne(surfaceFeatures, { where: { featured_date: today } })
      assert.ok(orphan, 'precondition: orphan feature row should exist')

      // getSurfaceOfTheDay should detect the stale row, drop it, and re-roll
      // to a surface that exists.
      const result = await getSurfaceOfTheDay(env.db)
      assert.ok(result)
      assert.equal(result.id, bId)

      // The stale row was dropped and replaced with a row pointing at bId.
      const features = await env.db.findMany(surfaceFeatures, {})
      assert.equal(features.length, 1)
      assert.equal(features[0]!.surface_id, bId)
    } finally {
      cleanup(env)
    }
  })
})
