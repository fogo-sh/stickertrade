import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { DatabaseSync } from 'node:sqlite'
import { createDatabase } from 'remix/data-table'
import { createSqliteDatabaseAdapter } from 'remix/data-table/sqlite'
import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'

import { stickers } from '../app/data/schema.ts'

const SLUG_MIGRATION_ID = '20260603000000'

describe('add_sticker_slug migration', () => {
  it('backfills name-derived slugs and enforces uniqueness', async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'stickertrade-mig-test-'))
    const dbPath = path.join(tmpDir, 'mig.sqlite')
    const sqlite = new DatabaseSync(dbPath)
    sqlite.exec('PRAGMA foreign_keys = ON')

    try {
      const adapter = createSqliteDatabaseAdapter(sqlite)
      const db = createDatabase(adapter)
      const allMigrations = await loadMigrations('./migrations')

      // Find the migration immediately before the slug one and run up to it.
      const slugIdx = allMigrations.findIndex((m) => m.id === SLUG_MIGRATION_ID)
      assert.ok(slugIdx > 0, 'slug migration must exist with previous migrations applied')
      const previousId = allMigrations[slugIdx - 1]!.id

      const runner = createMigrationRunner(adapter, allMigrations)
      await runner.up({ to: previousId })

      // Insert stickers using raw SQL because the schema in code already
      // has the slug column, but at this point in time the DB does not.
      const now = Date.now()
      const insert = sqlite.prepare(
        'INSERT INTO stickers (id, name, image_url, owner_id, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)',
      )
      const fixtures = [
        { id: randomUUID(), name: 'Dino Sticker', expect: /^dino-sticker-[0-9a-f]{6}$/ },
        { id: randomUUID(), name: 'hello', expect: /^hello-[0-9a-f]{6}$/ },
        { id: randomUUID(), name: '!!!', expect: /^[0-9a-f]{6}$/ },
        { id: randomUUID(), name: '🦖', expect: /^🦖-[0-9a-f]{6}$/ },
      ]
      for (const f of fixtures) {
        insert.run(f.id, f.name, '/uploads/test.png', now, now)
      }

      // Now apply the slug migration. The backfill UPDATE runs inside it.
      await runner.up({ to: SLUG_MIGRATION_ID })

      // Each sticker should now have a slug matching its expected pattern.
      const slugs: string[] = []
      for (const f of fixtures) {
        const row = await db.findOne(stickers, { where: { id: f.id } })
        assert.ok(row, `sticker ${f.name} not found`)
        assert.match(row.slug, f.expect, `slug for ${JSON.stringify(f.name)} = ${JSON.stringify(row.slug)}`)
        slugs.push(row.slug)
      }

      // All slugs unique.
      assert.equal(new Set(slugs).size, slugs.length, 'slugs should be unique')

      // The unique index rejects duplicates.
      const dupId = randomUUID()
      assert.throws(
        () => {
          sqlite
            .prepare(
              'INSERT INTO stickers (id, name, slug, image_url, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)',
            )
            .run(dupId, 'dup', slugs[0]!, '/uploads/x.png', now, now)
        },
        /UNIQUE/,
      )
    } finally {
      sqlite.close()
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

const SURFACES_MIGRATION_ID = '20260603100000'

describe('add_surfaces migration', () => {
  async function setup() {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'stickertrade-mig-test-'))
    const dbPath = path.join(tmpDir, 'mig.sqlite')
    const sqlite = new DatabaseSync(dbPath)
    sqlite.exec('PRAGMA foreign_keys = ON')
    const adapter = createSqliteDatabaseAdapter(sqlite)
    const allMigrations = await loadMigrations('./migrations')
    const runner = createMigrationRunner(adapter, allMigrations)
    await runner.up({ to: SURFACES_MIGRATION_ID })
    return { tmpDir, sqlite }
  }

  function teardown({ tmpDir, sqlite }: { tmpDir: string; sqlite: DatabaseSync }) {
    sqlite.close()
    rmSync(tmpDir, { recursive: true, force: true })
  }

  it('creates tables and enforces unique slug + featured_date', async () => {
    const env = await setup()
    try {
      const { sqlite } = env
      const userId = randomUUID()
      sqlite.prepare(
        'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(userId, 'surfacefan', 'hash', Date.now(), Date.now())

      const surfaceAId = randomUUID()
      sqlite.prepare(
        'INSERT INTO surfaces (id, name, slug, description, image_url, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(surfaceAId, 'My laptop', 'my-laptop-abc123', null, '/uploads/x.png', userId, Date.now(), Date.now())

      // Duplicate slug fails.
      assert.throws(() => {
        sqlite.prepare(
          'INSERT INTO surfaces (id, name, slug, image_url, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(randomUUID(), 'Other', 'my-laptop-abc123', '/uploads/y.png', userId, Date.now(), Date.now())
      }, /UNIQUE/)

      // Feature row for today.
      sqlite.prepare(
        'INSERT INTO surface_features (surface_id, featured_date, created_at) VALUES (?, ?, ?)',
      ).run(surfaceAId, '2026-06-03', Date.now())

      // Same surface, same date → fails.
      assert.throws(() => {
        sqlite.prepare(
          'INSERT INTO surface_features (surface_id, featured_date, created_at) VALUES (?, ?, ?)',
        ).run(surfaceAId, '2026-06-03', Date.now())
      }, /UNIQUE/)

      // DIFFERENT surface, same date → also fails (one pick per day, globally).
      const surfaceBId = randomUUID()
      sqlite.prepare(
        'INSERT INTO surfaces (id, name, slug, image_url, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(surfaceBId, 'Other surface', 'other-surface-xyz', '/uploads/z.png', userId, Date.now(), Date.now())

      assert.throws(() => {
        sqlite.prepare(
          'INSERT INTO surface_features (surface_id, featured_date, created_at) VALUES (?, ?, ?)',
        ).run(surfaceBId, '2026-06-03', Date.now())
      }, /UNIQUE/)
    } finally {
      teardown(env)
    }
  })

  it('cascades surface delete to surface_features', async () => {
    const env = await setup()
    try {
      const { sqlite } = env
      const userId = randomUUID()
      sqlite.prepare(
        'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(userId, 'cascadetest', 'hash', Date.now(), Date.now())

      const surfaceId = randomUUID()
      sqlite.prepare(
        'INSERT INTO surfaces (id, name, slug, image_url, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(surfaceId, 'X', 'x-aaa111', '/uploads/x.png', userId, Date.now(), Date.now())

      sqlite.prepare(
        'INSERT INTO surface_features (surface_id, featured_date, created_at) VALUES (?, ?, ?)',
      ).run(surfaceId, '2026-06-04', Date.now())

      sqlite.prepare('DELETE FROM surfaces WHERE id = ?').run(surfaceId)

      const remaining = sqlite
        .prepare('SELECT COUNT(*) AS n FROM surface_features WHERE surface_id = ?')
        .get(surfaceId) as { n: number }
      assert.equal(remaining.n, 0, 'deleting a surface should cascade to its features')
    } finally {
      teardown(env)
    }
  })

  it('cascades user delete to surfaces (and transitively to features)', async () => {
    const env = await setup()
    try {
      const { sqlite } = env
      const userId = randomUUID()
      sqlite.prepare(
        'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(userId, 'goingbye', 'hash', Date.now(), Date.now())

      const surfaceId = randomUUID()
      sqlite.prepare(
        'INSERT INTO surfaces (id, name, slug, image_url, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(surfaceId, 'Y', 'y-bbb222', '/uploads/y.png', userId, Date.now(), Date.now())

      sqlite.prepare(
        'INSERT INTO surface_features (surface_id, featured_date, created_at) VALUES (?, ?, ?)',
      ).run(surfaceId, '2026-06-05', Date.now())

      sqlite.prepare('DELETE FROM users WHERE id = ?').run(userId)

      const surfacesLeft = sqlite
        .prepare('SELECT COUNT(*) AS n FROM surfaces WHERE id = ?')
        .get(surfaceId) as { n: number }
      assert.equal(surfacesLeft.n, 0, 'deleting a user should cascade to surfaces')

      const featuresLeft = sqlite
        .prepare('SELECT COUNT(*) AS n FROM surface_features WHERE surface_id = ?')
        .get(surfaceId) as { n: number }
      assert.equal(featuresLeft.n, 0, 'deleting a user should transitively cascade to features')
    } finally {
      teardown(env)
    }
  })
})

const GALLERIES_MIGRATION_ID = '20260603200000'

describe('surface_galleries migration', () => {
  it('backfills primary images and enforces single-primary invariant', async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'stickertrade-mig-test-'))
    const dbPath = path.join(tmpDir, 'mig.sqlite')
    const sqlite = new DatabaseSync(dbPath)
    sqlite.exec('PRAGMA foreign_keys = ON')

    try {
      const adapter = createSqliteDatabaseAdapter(sqlite)
      const allMigrations = await loadMigrations('./migrations')
      const runner = createMigrationRunner(adapter, allMigrations)

      // Apply up to (but not including) the galleries migration so the
      // surfaces table still has image_url.
      const idx = allMigrations.findIndex((m) => m.id === GALLERIES_MIGRATION_ID)
      assert.ok(idx > 0, 'galleries migration must exist')
      await runner.up({ to: allMigrations[idx - 1]!.id })

      // Seed a user + surface with the pre-migration shape.
      const userId = randomUUID()
      sqlite.prepare(
        'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(userId, 'galleryfan', 'hash', Date.now(), Date.now())

      const surfaceId = randomUUID()
      sqlite.prepare(
        'INSERT INTO surfaces (id, name, slug, description, image_url, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(surfaceId, 'Pre-migration', 'pre-migration-abc', null, '/uploads/old.png', userId, Date.now(), Date.now())

      // Apply the galleries migration.
      await runner.up({ to: GALLERIES_MIGRATION_ID })

      // surfaces.image_url is gone — raw SELECT should error.
      assert.throws(
        () => sqlite.prepare('SELECT image_url FROM surfaces').get(),
        /no such column/,
      )

      // surface_images has one row with is_primary=1 pointing at the old url.
      const row = sqlite.prepare(
        'SELECT id, surface_id, image_url, is_primary FROM surface_images WHERE surface_id = ?',
      ).get(surfaceId) as { id: string; surface_id: string; image_url: string; is_primary: number }
      assert.ok(row)
      assert.equal(row.surface_id, surfaceId)
      assert.equal(row.image_url, '/uploads/old.png')
      assert.equal(row.is_primary, 1)
      // id is UUID-shaped.
      assert.match(row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

      // Partial unique index rejects a second primary for the same surface.
      assert.throws(
        () =>
          sqlite.prepare(
            'INSERT INTO surface_images (id, surface_id, image_url, is_primary, created_at) VALUES (?, ?, ?, 1, ?)',
          ).run(randomUUID(), surfaceId, '/uploads/another.png', Date.now()),
        /UNIQUE/,
      )

      // But a non-primary image is allowed.
      sqlite.prepare(
        'INSERT INTO surface_images (id, surface_id, image_url, is_primary, created_at) VALUES (?, ?, ?, 0, ?)',
      ).run(randomUUID(), surfaceId, '/uploads/gallery-1.png', Date.now())

      const count = sqlite.prepare(
        'SELECT COUNT(*) AS n FROM surface_images WHERE surface_id = ?',
      ).get(surfaceId) as { n: number }
      assert.equal(count.n, 2)

      // CASCADE on surface delete sweeps both images.
      sqlite.prepare('DELETE FROM surfaces WHERE id = ?').run(surfaceId)
      const after = sqlite.prepare(
        'SELECT COUNT(*) AS n FROM surface_images WHERE surface_id = ?',
      ).get(surfaceId) as { n: number }
      assert.equal(after.n, 0)
    } finally {
      sqlite.close()
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
