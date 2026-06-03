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
  it('creates surfaces and surface_features tables with the expected constraints', async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'stickertrade-mig-test-'))
    const dbPath = path.join(tmpDir, 'mig.sqlite')
    const sqlite = new DatabaseSync(dbPath)
    sqlite.exec('PRAGMA foreign_keys = ON')

    try {
      const adapter = createSqliteDatabaseAdapter(sqlite)
      const allMigrations = await loadMigrations('./migrations')
      const runner = createMigrationRunner(adapter, allMigrations)
      await runner.up({ to: SURFACES_MIGRATION_ID })

      // Verify the tables exist by inserting a user + surface and reading back.
      const userId = randomUUID()
      sqlite.prepare(
        'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(userId, 'surfacefan', 'hash', Date.now(), Date.now())

      const surfaceId = randomUUID()
      sqlite.prepare(
        'INSERT INTO surfaces (id, name, slug, description, image_url, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(surfaceId, 'My laptop', 'my-laptop-abc123', null, '/uploads/x.png', userId, Date.now(), Date.now())

      // Unique slug constraint
      assert.throws(() => {
        sqlite.prepare(
          'INSERT INTO surfaces (id, name, slug, image_url, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(randomUUID(), 'Other', 'my-laptop-abc123', '/uploads/y.png', userId, Date.now(), Date.now())
      }, /UNIQUE/)

      // surface_features table + unique featured_date
      sqlite.prepare(
        'INSERT INTO surface_features (surface_id, featured_date, created_at) VALUES (?, ?, ?)',
      ).run(surfaceId, '2026-06-03', Date.now())

      assert.throws(() => {
        sqlite.prepare(
          'INSERT INTO surface_features (surface_id, featured_date, created_at) VALUES (?, ?, ?)',
        ).run(surfaceId, '2026-06-03', Date.now())
      }, /UNIQUE/)

      // CASCADE on user delete removes the surface
      sqlite.prepare('DELETE FROM users WHERE id = ?').run(userId)
      const remaining = sqlite
        .prepare('SELECT COUNT(*) AS n FROM surfaces WHERE id = ?')
        .get(surfaceId) as { n: number }
      assert.equal(remaining.n, 0, 'deleting user should cascade to surfaces')

      // ... and that cascade hits surface_features too
      const remainingFeature = sqlite
        .prepare('SELECT COUNT(*) AS n FROM surface_features WHERE surface_id = ?')
        .get(surfaceId) as { n: number }
      assert.equal(remainingFeature.n, 0, 'deleting surface should cascade to features')
    } finally {
      sqlite.close()
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
