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
