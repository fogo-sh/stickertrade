# Sticker Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new content type — "surfaces" — for photos of stickered real-world objects (laptops, fridges, water bottles, etc.), plus a randomized daily "Surface of the Day" feature on the home page with persisted pick history.

**Architecture:** Two new tables (`surfaces`, `surface_features`). Public slug-based URLs mirroring the sticker pattern. UUID-only form action / API / admin URLs. On-demand lazy daily-pick algorithm in `app/data/surface-of-the-day.ts` with race-safe persistence via a `UNIQUE` constraint on `featured_date`. Image pipeline reuses the existing `processImageUpload` with a new `processSurfaceUpload` wrapper that skips center-crop and caps at 2000px.

**Tech Stack:** Remix 3, `remix/data-table` (SQLite via `node:sqlite`), `sharp` for image processing, `node:crypto` for UUIDs and slug suffixes, `node:test` for tests.

**Spec:** `docs/superpowers/specs/2026-06-03-sticker-surfaces-design.md`

**Working branch:** `sticker-surfaces` (already checked out)

---

## File Structure

**Create:**
- `app/data/surface-of-the-day.ts` — `getSurfaceOfTheDay(db)` algorithm
- `app/actions/upload-surface/controller.tsx` — GET form + POST create
- `app/actions/upload-surface-page.tsx` — upload form component
- `app/actions/edit-surface/controller.tsx` — GET form + POST update
- `app/actions/edit-surface-page.tsx` — edit form component
- `app/actions/remove-surface/controller.tsx` — POST delete
- `app/actions/surfaces-page.tsx` — `/surfaces` index component
- `app/actions/surface-page.tsx` — `/surface/:slug` show component
- `app/actions/admin/admin-surfaces-page.tsx` — admin surfaces moderation page
- `app/ui/surface-card.tsx` — reusable surface display primitive
- `migrations/20260603100000_add_surfaces/up.sql` — table + indexes
- `migrations/20260603100000_add_surfaces/down.sql` — reverse
- `test/surface-of-the-day.test.ts` — algorithm unit tests

**Modify:**
- `app/data/slug.ts` — rename `generateStickerSlug` → `generateContentSlug`
- `app/data/schema.ts` — add `surfaces` and `surface_features` tables
- `app/data/upload-image.ts` — add `processSurfaceUpload`
- `app/data/validators.ts` — add `surfaceNameSchema`, `surfaceDescriptionSchema`
- `app/data/roadmap.ts` — add "Recently shipped" entry
- `app/routes.ts` — add ~10 new route keys
- `app/router.ts` — map 3 new controllers
- `app/actions/controller.tsx` — add surfaces index, surface show, extend home + profile + stickers actions
- `app/actions/home-page.tsx` — render Surface of the Day block
- `app/actions/profile-page.tsx` — render surfaces section
- `app/actions/admin/controller.tsx` — add surfaces index + delete actions
- `app/actions/api/controller.tsx` — add 6 surface endpoints + userSurfaces
- `app/actions/api/serializers.ts` — add `JsonSurface` + `serializeSurface`
- `app/actions/upload-sticker/controller.tsx` — rename usage of `generateStickerSlug`
- `scripts/seed.ts` — rename usage; add a sample surface
- `test/smoke.test.ts` — rename usage; add surface coverage
- `test/migrations.test.ts` — add migration test for new tables

**Do NOT modify:**
- Sticker controllers (other than the slug-helper rename)
- Auth / session / CSRF middleware
- Invitations

---

## Notes for the executing agent

- **Pure-SQL migrations**: this repo uses `up.sql` + `down.sql` per timestamped directory, loaded by `remix/data-table/migrations/node`. There is no JS hook inside migrations.
- **Slug pattern**: surfaces use the same slug shape as stickers (`<name-derived>-<6 random a-z0-9>`). The runtime helper is `generateContentSlug` after the Task 1 rename.
- **UUID → slug redirect on show + edit GET pages**: same shape as the sticker controllers. Use `looksLikeUuid` from `app/data/slug.ts` and `encodeURIComponent` when building the Location header.
- **`routes.X.href(...)` does NOT encode**: when building slug URLs for redirects, use the same pattern Tasks 3+4 of the sticker-slugs PR introduced: `` `/surface/${encodeURIComponent(slug)}` `` instead of `routes.surface.href({ slug })`.
- **Image pipeline**: the existing `processImageUpload(file, options)` already supports `maxEdge` without `squareCrop`, so `processSurfaceUpload` is a 3-line wrapper that picks `folder: 'surfaces', maxEdge: 2000`. The spec mentioned WebP but the existing pipeline only emits PNG or JPEG (same as the source MIME). Stick with the existing encode behavior for symmetry — no new WebP path.
- **Existing sticker tests** in `test/smoke.test.ts` use `generateStickerSlug`. After Task 1 they'll use `generateContentSlug`. The rename touches both the import line and the call sites in tests.
- **The plan favors per-area tasks** (schema + migration + tests as Task 2, etc.) over per-file tasks. Each task should leave the tree in a typecheck-clean state OR explicitly note the broken intermediate state and the task that fixes it.


## Task 1: Rename `generateStickerSlug` → `generateContentSlug`

**Files:**
- Modify: `app/data/slug.ts`
- Modify: `app/actions/upload-sticker/controller.tsx`
- Modify: `scripts/seed.ts`
- Modify: `test/smoke.test.ts`
- Modify: `test/slug.test.ts`

This is a pure rename refactor. Foundational because every later surface task uses `generateContentSlug`.

- [ ] **Step 1.1: Rename the export and update its JSDoc**

In `app/data/slug.ts`, find:

```ts
/**
 * Build a full sticker slug: `<slug-part>-<6 lowercase alphanumerics>`.
 * If `slugifyName(name)` is empty, returns just the 6-char suffix.
 */
export function generateStickerSlug(name: string): string {
```

Change to:

```ts
/**
 * Build a full content slug: `<slug-part>-<6 lowercase alphanumerics>`.
 * If `slugifyName(name)` is empty, returns just the 6-char suffix.
 *
 * Used by both stickers and surfaces (and any future named content type)
 * since the alphabet, suffix length, and 40-char cap are universal.
 */
export function generateContentSlug(name: string): string {
```

- [ ] **Step 1.2: Update call sites**

Find every `generateStickerSlug` reference via ripgrep:

```bash
rg "generateStickerSlug" --type ts --type tsx
```

There are 4 call sites to rename (the import + use in each of these):
- `app/actions/upload-sticker/controller.tsx`
- `scripts/seed.ts`
- `test/smoke.test.ts`
- `test/slug.test.ts`

In each file, replace `generateStickerSlug` with `generateContentSlug` for both the import and every call.

- [ ] **Step 1.3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean. If errors remain, ripgrep missed a call site — fix and re-run.

- [ ] **Step 1.4: Run tests**

```bash
npm test
```

Expected: 52/52 passing (no test behavior changed; just a rename).

- [ ] **Step 1.5: Commit**

```bash
git add app/data/slug.ts app/actions/upload-sticker/controller.tsx scripts/seed.ts test/smoke.test.ts test/slug.test.ts
git commit -m "rename generateStickerSlug to generateContentSlug"
```

---

## Task 2: Schema, migration, migration test

**Files:**
- Modify: `app/data/schema.ts`
- Create: `migrations/20260603100000_add_surfaces/up.sql`
- Create: `migrations/20260603100000_add_surfaces/down.sql`
- Modify: `test/migrations.test.ts`

- [ ] **Step 2.1: Add `surfaces` and `surface_features` tables to the runtime schema**

Edit `app/data/schema.ts`. Add these tables after `apiTokens`:

```ts
export const surfaces = table({
  name: 'surfaces',
  columns: {
    id: c.text().primaryKey(),
    name: c.text().notNull(),
    slug: c.text().notNull().unique(),
    description: c.text(),
    image_url: c.text().notNull(),
    owner_id: c.text().notNull(),
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})

export const surface_features = table({
  name: 'surface_features',
  columns: {
    id: c.integer().primaryKey().autoIncrement(),
    surface_id: c.text().notNull(),
    featured_date: c.text().notNull().unique(),
    created_at: c.integer().notNull(),
  },
})
```

Also add the type exports:

```ts
export type Surface = TableRow<typeof surfaces>
export type SurfaceFeature = TableRow<typeof surface_features>
```

- [ ] **Step 2.2: Create migration up.sql**

Create `migrations/20260603100000_add_surfaces/up.sql`:

```sql
CREATE TABLE surfaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX surfaces_slug_unique ON surfaces(slug);
CREATE INDEX surfaces_owner_id_idx ON surfaces(owner_id);

CREATE TABLE surface_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  surface_id TEXT NOT NULL REFERENCES surfaces(id) ON DELETE CASCADE,
  featured_date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX surface_features_featured_date_unique
  ON surface_features(featured_date);
```

- [ ] **Step 2.3: Create migration down.sql**

Create `migrations/20260603100000_add_surfaces/down.sql`:

```sql
DROP TABLE surface_features;
DROP TABLE surfaces;
```

- [ ] **Step 2.4: Write the failing migration test**

Edit `test/migrations.test.ts`. Add a new `describe` block at the bottom:

```ts
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
```

- [ ] **Step 2.5: Run the migration test**

```bash
npm test -- --test-name-pattern='add_surfaces migration'
```

Expected: PASS. (The migration files exist; the test exercises them end-to-end.)

If you want to confirm the test is real (TDD discipline), rename the migration directory temporarily, re-run, observe failure, restore, re-run.

- [ ] **Step 2.6: Run all tests**

```bash
npm test
```

Expected: 52 prior tests + 1 new migration test = 53 passing.

- [ ] **Step 2.7: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 2.8: Commit**

```bash
git add app/data/schema.ts migrations/20260603100000_add_surfaces/ test/migrations.test.ts
git commit -m "add surfaces + surface_features tables + migration test"
```

---

## Task 3: Image pipeline + form validators

**Files:**
- Modify: `app/data/upload-image.ts`
- Modify: `app/data/validators.ts`

Small additive task. Adds `processSurfaceUpload` (a 3-line wrapper around the existing `processImageUpload`) and the new validator schemas.

- [ ] **Step 3.1: Add `processSurfaceUpload`**

Edit `app/data/upload-image.ts`. Add this function below the existing `processAvatarUpload`:

```ts
export async function processSurfaceUpload(file: File): Promise<string> {
  return processImageUpload(file, { folder: 'surfaces', maxEdge: 2000 })
}
```

That's it. `processImageUpload` already handles MIME validation, size limits, sharp pipeline, metadata stripping, JPEG/PNG encoding, and storage. `maxEdge: 2000` preserves aspect ratio (no `squareCrop`).

- [ ] **Step 3.2: Add `surfaceNameSchema` and `surfaceDescriptionSchema`**

Edit `app/data/validators.ts`. Add after `stickerNameSchema`:

```ts
/** Surface names are 1-80 chars after trimming. */
export const surfaceNameSchema = boundedString(1, 80, 'Name must be 1-80 characters')

/**
 * Surface descriptions are optional, up to 500 chars after trimming.
 * An empty or whitespace-only submission becomes `null` so the column
 * stays clean.
 */
export const surfaceDescriptionSchema = s
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length <= 500, 'Description must be 500 characters or less')
  .transform((value) => (value.length === 0 ? null : value))
```

- [ ] **Step 3.3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3.4: Run tests**

```bash
npm test
```

Expected: 53/53 passing (no test behavior changed).

- [ ] **Step 3.5: Commit**

```bash
git add app/data/upload-image.ts app/data/validators.ts
git commit -m "add surface upload pipeline + form validators"
```

---

## Task 4: Surface of the Day algorithm + tests

**Files:**
- Create: `app/data/surface-of-the-day.ts`
- Create: `test/surface-of-the-day.test.ts`

TDD: write the failing tests first, then the implementation.

- [ ] **Step 4.1: Write the failing test file**

Create `test/surface-of-the-day.test.ts`:

```ts
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

import { surfaces, surface_features, users } from '../app/data/schema.ts'
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
    avatar_url: null,
    invitation_id: null,
    invitation_limit: 10,
    created_at: now,
    updated_at: now,
  })
  return id
}

async function makeSurface(env: TestEnv, ownerId: string, name: string): Promise<string> {
  const id = randomUUID()
  const now = Date.now()
  await env.db.create(surfaces, {
    id,
    name,
    slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${id.slice(0, 6)}`,
    description: null,
    image_url: '/uploads/test.png',
    owner_id: ownerId,
    created_at: now,
    updated_at: now,
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

      // A feature row was persisted for today.
      const today = new Date().toISOString().slice(0, 10)
      const feature = await env.db.findOne(surface_features, {
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

      // Only one feature row.
      const count = await env.db.count(surface_features)
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

      // Force today's pick to be Alpha.
      const today = new Date().toISOString().slice(0, 10)
      await env.db.create(surface_features, {
        surface_id: aId,
        featured_date: today,
        created_at: Date.now(),
      })

      // Delete Alpha.
      await env.db.delete(surfaces, aId)

      // getSurfaceOfTheDay should drop the stale feature row and re-roll.
      const result = await getSurfaceOfTheDay(env.db)
      assert.ok(result)
      assert.equal(result.id, bId)

      // The new feature row points at Beta.
      const features = await env.db.findMany(surface_features, {})
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
      await env.db.create(surface_features, {
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
})
```

- [ ] **Step 4.2: Run the failing tests**

```bash
npm test -- --test-name-pattern='getSurfaceOfTheDay'
```

Expected: FAIL — `app/data/surface-of-the-day.ts` does not exist.

- [ ] **Step 4.3: Implement `app/data/surface-of-the-day.ts`**

Create `app/data/surface-of-the-day.ts`:

```ts
import type { Database } from 'remix/data-table'

import { surfaces, surface_features, type Surface } from './schema.ts'

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
  const existing = await db.findOne(surface_features, {
    where: { featured_date: todayUtc },
  })
  if (existing) {
    const surface = await db.findOne(surfaces, { where: { id: existing.surface_id } })
    if (surface) return surface
    // Surface was deleted after being picked. Drop the stale feature row
    // and fall through to re-roll.
    await db.delete(surface_features, existing.id)
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
    await db.create(surface_features, {
      surface_id: chosen.id,
      featured_date: todayUtc,
      created_at: Date.now(),
    })
    return chosen
  } catch {
    // Lost the race. Re-read whatever the winning request wrote.
    const winner = await db.findOne(surface_features, {
      where: { featured_date: todayUtc },
    })
    if (!winner) return null
    return db.findOne(surfaces, { where: { id: winner.surface_id } })
  }
}
```

- [ ] **Step 4.4: Run the tests again**

```bash
npm test -- --test-name-pattern='getSurfaceOfTheDay'
```

Expected: PASS, all 5 tests.

- [ ] **Step 4.5: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4.6: Run all tests**

```bash
npm test
```

Expected: 53 + 5 new = 58 passing.

- [ ] **Step 4.7: Commit**

```bash
git add app/data/surface-of-the-day.ts test/surface-of-the-day.test.ts
git commit -m "add surface-of-the-day algorithm + tests"
```

---

## Task 5: Route contract + show/index page + upload flow

**Files:**
- Modify: `app/routes.ts`
- Modify: `app/router.ts`
- Modify: `app/actions/controller.tsx`
- Create: `app/actions/surfaces-page.tsx`
- Create: `app/actions/surface-page.tsx`
- Create: `app/actions/upload-surface/controller.tsx`
- Create: `app/actions/upload-surface-page.tsx`
- Create: `app/ui/surface-card.tsx`

This lands the minimum viable surface flow: user can upload, see the show page, and see the index page. Edit / remove / admin / API come in later tasks.

- [ ] **Step 5.1: Add routes to `app/routes.ts`**

Edit `app/routes.ts`. Add these route keys in the appropriate sections (mirror the sticker structure):

```ts
  // Public pages — add next to stickers/sticker
  surfaces: '/surfaces',
  surface: '/surface/:slug',

  // Form actions — add next to uploadSticker
  uploadSurface: form('/upload-surface'),
```

(The other surface routes — editSurface, removeSurface, admin, API — come in later tasks. This step adds only the three needed for the upload→show flow.)

- [ ] **Step 5.2: Wire controllers in `app/router.ts`**

Edit `app/router.ts`. Add the import:

```ts
import uploadSurfaceController from './actions/upload-surface/controller.tsx'
```

(Alphabetical order: between `uploadStickerController` and the imports below it.)

Add the mapping at the bottom of the file alongside the other `router.map` calls:

```ts
router.map(routes.uploadSurface, uploadSurfaceController)
```

- [ ] **Step 5.3: Create `app/ui/surface-card.tsx`**

Create `app/ui/surface-card.tsx`. Follow the existing `app/ui/sticker-card.tsx` pattern. Surface card shape:

```tsx
import { css } from 'remix/ui'

import { routes } from '../routes.ts'

interface SurfaceCardProps {
  surface: {
    id: string
    slug: string
    name: string
    description: string | null
    image_url: string
    owner: {
      username: string
      avatar_url: string | null
    }
  }
}

const cardStyle = css({
  display: 'block',
  marginBottom: '2rem',
  textDecoration: 'none',
  color: 'inherit',
  '&:hover img': { opacity: 0.95 },
})

const imageStyle = css({
  width: '100%',
  height: 'auto',
  maxHeight: '600px',
  objectFit: 'contain',
  borderRadius: '8px',
  display: 'block',
})

const titleStyle = css({
  margin: '0.5rem 0 0.25rem',
  fontSize: '1.25rem',
  fontWeight: '600',
})

const metaStyle = css({
  margin: 0,
  fontSize: '0.875rem',
  color: 'var(--color-text-muted, #666)',
})

const descriptionStyle = css({
  margin: '0.5rem 0 0',
  fontSize: '0.95rem',
  lineHeight: '1.4',
})

export function SurfaceCard({ surface }: SurfaceCardProps) {
  const previewLimit = 120
  const preview =
    surface.description && surface.description.length > previewLimit
      ? surface.description.slice(0, previewLimit) + '…'
      : surface.description
  return (
    <a
      href={routes.surface.href({ slug: surface.slug })}
      mix={cardStyle}
    >
      <img src={surface.image_url} alt={surface.name} mix={imageStyle} />
      <p mix={titleStyle}>{surface.name}</p>
      <p mix={metaStyle}>by {surface.owner.username}</p>
      {preview ? <p mix={descriptionStyle}>{preview}</p> : null}
    </a>
  )
}
```

Open `app/ui/sticker-card.tsx` first to confirm the exact import paths and `css` helper usage match what's already in the codebase.

- [ ] **Step 5.4: Create `app/actions/surface-page.tsx`**

Create `app/actions/surface-page.tsx`. Follow the existing `app/actions/sticker-page.tsx` pattern for OG metadata and structure. Show page shape:

```tsx
import { css } from 'remix/ui'

import { Document } from '../ui/document.tsx'
import { Header } from '../ui/header.tsx'
import { Footer } from '../ui/footer.tsx'
import { routes } from '../routes.ts'
import type { AuthedUser } from '../data/current-user.ts'

interface SurfacePageProps {
  user: AuthedUser | null
  surface: {
    id: string
    slug: string
    name: string
    description: string | null
    image_url: string
    owner: {
      username: string
      avatar_url: string | null
    }
  }
  canEdit: boolean
  publicOrigin: string
}

const wrapStyle = css({ maxWidth: '1000px', margin: '0 auto', padding: '1rem' })
const imageStyle = css({
  width: '100%',
  height: 'auto',
  borderRadius: '8px',
  display: 'block',
})
const titleStyle = css({ marginTop: '1rem', marginBottom: '0.25rem' })
const ownerStyle = css({ marginTop: 0, color: 'var(--color-text-muted, #666)' })
const descriptionStyle = css({
  marginTop: '1rem',
  whiteSpace: 'pre-wrap',
  lineHeight: '1.5',
})
const actionsStyle = css({
  marginTop: '1rem',
  display: 'flex',
  gap: '0.5rem',
})

export function SurfacePage({ user, surface, canEdit, publicOrigin }: SurfacePageProps) {
  const url = `${publicOrigin}${routes.surface.href({ slug: surface.slug })}`
  const description = surface.description ?? `A sticker surface by ${surface.owner.username}.`
  return (
    <Document
      title={`${surface.name} — stickertrade`}
      og={{
        title: surface.name,
        description,
        url,
        image: `${publicOrigin}${surface.image_url}`,
      }}
    >
      <Header user={user} />
      <main mix={wrapStyle}>
        <img src={surface.image_url} alt={surface.name} mix={imageStyle} />
        <h1 mix={titleStyle}>{surface.name}</h1>
        <p mix={ownerStyle}>
          by{' '}
          <a href={routes.profile.href({ username: surface.owner.username })}>
            {surface.owner.username}
          </a>
        </p>
        {surface.description ? <p mix={descriptionStyle}>{surface.description}</p> : null}
        {canEdit ? (
          <div mix={actionsStyle}>
            <a href={routes.editSurface.index.href({ slug: surface.slug })}>edit</a>
          </div>
        ) : null}
      </main>
      <Footer />
    </Document>
  )
}
```

(The `editSurface` route is added in a later task; for now the `canEdit` block will fail typecheck. To unblock Task 5 standalone, you can either omit the canEdit block until Task 6 lands the edit route OR temporarily inline `routes.profile.href({ username: surface.owner.username })` as a no-op link. **Choose: omit the canEdit block for now** — Task 6 re-adds it when the route exists.)

Updated SurfacePage (Task 5 version) — drop the `canEdit` prop and the actions block:

```tsx
import { css } from 'remix/ui'

import { Document } from '../ui/document.tsx'
import { Header } from '../ui/header.tsx'
import { Footer } from '../ui/footer.tsx'
import { routes } from '../routes.ts'
import type { AuthedUser } from '../data/current-user.ts'

interface SurfacePageProps {
  user: AuthedUser | null
  surface: {
    id: string
    slug: string
    name: string
    description: string | null
    image_url: string
    owner: {
      username: string
      avatar_url: string | null
    }
  }
  publicOrigin: string
}

const wrapStyle = css({ maxWidth: '1000px', margin: '0 auto', padding: '1rem' })
const imageStyle = css({
  width: '100%',
  height: 'auto',
  borderRadius: '8px',
  display: 'block',
})
const titleStyle = css({ marginTop: '1rem', marginBottom: '0.25rem' })
const ownerStyle = css({ marginTop: 0, color: 'var(--color-text-muted, #666)' })
const descriptionStyle = css({
  marginTop: '1rem',
  whiteSpace: 'pre-wrap',
  lineHeight: '1.5',
})

export function SurfacePage({ user, surface, publicOrigin }: SurfacePageProps) {
  const url = `${publicOrigin}${routes.surface.href({ slug: surface.slug })}`
  const description = surface.description ?? `A sticker surface by ${surface.owner.username}.`
  return (
    <Document
      title={`${surface.name} — stickertrade`}
      og={{
        title: surface.name,
        description,
        url,
        image: `${publicOrigin}${surface.image_url}`,
      }}
    >
      <Header user={user} />
      <main mix={wrapStyle}>
        <img src={surface.image_url} alt={surface.name} mix={imageStyle} />
        <h1 mix={titleStyle}>{surface.name}</h1>
        <p mix={ownerStyle}>
          by{' '}
          <a href={routes.profile.href({ username: surface.owner.username })}>
            {surface.owner.username}
          </a>
        </p>
        {surface.description ? <p mix={descriptionStyle}>{surface.description}</p> : null}
      </main>
      <Footer />
    </Document>
  )
}
```

Before writing the file, open `app/actions/sticker-page.tsx` to confirm the exact imports (`Document`, `Header`, `Footer` paths) and `publicOrigin` prop derivation. Mirror that file's pattern.

- [ ] **Step 5.5: Create `app/actions/surfaces-page.tsx`**

Create `app/actions/surfaces-page.tsx`. Follow the existing `app/actions/stickers-page.tsx` pattern. Index page:

```tsx
import { css } from 'remix/ui'

import { SurfaceCard } from '../ui/surface-card.tsx'
import { Document } from '../ui/document.tsx'
import { Header } from '../ui/header.tsx'
import { Footer } from '../ui/footer.tsx'
import type { AuthedUser } from '../data/current-user.ts'

interface SurfacesPageProps {
  user: AuthedUser | null
  surfaces: Array<{
    id: string
    slug: string
    name: string
    description: string | null
    image_url: string
    owner: {
      username: string
      avatar_url: string | null
    }
  }>
}

const wrapStyle = css({ maxWidth: '700px', margin: '0 auto', padding: '1rem' })
const headingStyle = css({ marginBottom: '1.5rem' })
const emptyStyle = css({ color: 'var(--color-text-muted, #666)' })

export function SurfacesPage({ user, surfaces }: SurfacesPageProps) {
  return (
    <Document title="Surfaces — stickertrade">
      <Header user={user} />
      <main mix={wrapStyle}>
        <h1 mix={headingStyle}>Surfaces</h1>
        {surfaces.length === 0 ? (
          <p mix={emptyStyle}>No surfaces yet.</p>
        ) : (
          surfaces.map((s) => <SurfaceCard key={s.id} surface={s} />)
        )}
      </main>
      <Footer />
    </Document>
  )
}
```

Open `app/actions/stickers-page.tsx` first to confirm the exact pattern (heading, layout, etc.) and adapt.

- [ ] **Step 5.6: Extend root controller (`app/actions/controller.tsx`) for show + index**

Edit `app/actions/controller.tsx`. Two new actions inside the `actions` object: `surfaces` (index) and `surface` (show). Mirror the existing `stickers` and `sticker` actions.

Add imports at the top:

```ts
import { surfaces, type Surface } from '../data/schema.ts'
import { SurfacesPage } from './surfaces-page.tsx'
import { SurfacePage } from './surface-page.tsx'
```

(Confirm by reading the existing imports — `stickers` is already imported, add `surfaces` to that same import statement.)

Add the new actions inside the controller. Use the existing `sticker` action as a template for the redirect logic:

```ts
    // -------- Surfaces index --------
    async surfaces(context) {
      const db = context.get(Database)
      const rows = await db.findMany(surfaces, {
        orderBy: ['created_at', 'desc'],
        limit: 50,
      })
      const ownerIds = Array.from(new Set(rows.map((s) => s.owner_id)))
      const ownerRows = ownerIds.length
        ? await db.findMany(users, { where: inList('id', ownerIds) })
        : []
      const ownerById = new Map(ownerRows.map((u) => [u.id, u]))
      return context.render(
        <SurfacesPage
          user={getCurrentUser(context)}
          surfaces={rows.map((s) => {
            const owner = ownerById.get(s.owner_id)
            return {
              id: s.id,
              slug: s.slug,
              name: s.name,
              description: s.description,
              image_url: s.image_url,
              owner: owner
                ? { username: owner.username, avatar_url: owner.avatar_url ?? null }
                : { username: 'unknown', avatar_url: null },
            }
          })}
        />,
      )
    },

    // -------- Surface show --------
    async surface(context) {
      const db = context.get(Database)
      const param = context.params.slug

      // Backwards compatibility: UUID URLs 301-redirect to the slug URL.
      if (looksLikeUuid(param)) {
        const byId = await db.findOne(surfaces, { where: { id: param } })
        if (!byId) return notFound()
        return redirect(`/surface/${encodeURIComponent(byId.slug)}`, 301)
      }

      const surface = await db.findOne(surfaces, { where: { slug: param } })
      if (!surface) return notFound()
      const owner = await db.findOne(users, { where: { id: surface.owner_id } })
      if (!owner) return notFound() // shouldn't happen due to CASCADE FK
      return context.render(
        <SurfacePage
          user={getCurrentUser(context)}
          surface={{
            id: surface.id,
            slug: surface.slug,
            name: surface.name,
            description: surface.description,
            image_url: surface.image_url,
            owner: { username: owner.username, avatar_url: owner.avatar_url ?? null },
          }}
          publicOrigin={getPublicOrigin(context)}
        />,
      )
    },
```

The `looksLikeUuid`, `notFound`, `redirect`, `inList`, `getPublicOrigin` symbols may need to be added to the imports — check what's already there. `getPublicOrigin` is what the existing `sticker` action uses; mirror that pattern exactly. If `notFound` isn't defined, use `new Response('Not Found', { status: 404 })` inline.

Place the new actions in a logical spot — between `users` and `sticker` is fine.

- [ ] **Step 5.7: Create `app/actions/upload-surface-page.tsx`**

Create `app/actions/upload-surface-page.tsx`. Follow the existing `app/actions/upload-sticker-page.tsx` pattern, adding a description textarea:

```tsx
import { css } from 'remix/ui'

import { Document } from '../ui/document.tsx'
import { Header } from '../ui/header.tsx'
import { Footer } from '../ui/footer.tsx'
import { CsrfField } from '../ui/form.tsx'
import { routes } from '../routes.ts'
import type { AuthedUser } from '../data/current-user.ts'

interface UploadSurfacePageProps {
  user: AuthedUser
  values?: { name?: string; description?: string }
  errors?: { name?: string; description?: string; image?: string; _form?: string }
}

const wrapStyle = css({ maxWidth: '500px', margin: '0 auto', padding: '1rem' })
const fieldStyle = css({ display: 'block', marginBottom: '1rem' })
const labelStyle = css({ display: 'block', marginBottom: '0.25rem', fontWeight: '600' })
const inputStyle = css({ width: '100%', padding: '0.5rem', boxSizing: 'border-box' })
const textareaStyle = css({
  width: '100%',
  padding: '0.5rem',
  boxSizing: 'border-box',
  minHeight: '120px',
  fontFamily: 'inherit',
  fontSize: 'inherit',
})
const errorStyle = css({ color: '#c00', marginTop: '0.25rem', fontSize: '0.875rem' })

export function UploadSurfacePage({ user, values, errors }: UploadSurfacePageProps) {
  return (
    <Document title="Upload a surface — stickertrade">
      <Header user={user} />
      <main mix={wrapStyle}>
        <h1>Upload a surface</h1>
        <form
          method="post"
          action={routes.uploadSurface.action.href()}
          encType="multipart/form-data"
        >
          <CsrfField />
          <label mix={fieldStyle}>
            <span mix={labelStyle}>Name</span>
            <input
              type="text"
              name="name"
              defaultValue={values?.name ?? ''}
              mix={inputStyle}
              required
              maxLength={80}
            />
            {errors?.name ? <span mix={errorStyle}>{errors.name}</span> : null}
          </label>
          <label mix={fieldStyle}>
            <span mix={labelStyle}>Description (optional)</span>
            <textarea
              name="description"
              defaultValue={values?.description ?? ''}
              mix={textareaStyle}
              maxLength={500}
            />
            {errors?.description ? <span mix={errorStyle}>{errors.description}</span> : null}
          </label>
          <label mix={fieldStyle}>
            <span mix={labelStyle}>Image</span>
            <input type="file" name="image" accept="image/png,image/jpeg,image/webp" required />
            {errors?.image ? <span mix={errorStyle}>{errors.image}</span> : null}
          </label>
          {errors?._form ? <p mix={errorStyle}>{errors._form}</p> : null}
          <button type="submit">Upload</button>
        </form>
      </main>
      <Footer />
    </Document>
  )
}
```

Open `app/actions/upload-sticker-page.tsx` first to confirm the exact imports (`CsrfField`, etc.) and mirror.

- [ ] **Step 5.8: Create `app/actions/upload-surface/controller.tsx`**

Create the upload controller, mirroring `app/actions/upload-sticker/controller.tsx`:

```tsx
import { randomUUID } from 'node:crypto'

import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces } from '../../data/schema.ts'
import { generateContentSlug } from '../../data/slug.ts'
import { processSurfaceUpload } from '../../data/upload-image.ts'
import {
  issuesToFieldErrors,
  surfaceDescriptionSchema,
  surfaceNameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { readVerifiedUploadFormData } from '../../utils/upload.ts'
import { UploadSurfacePage } from '../upload-surface-page.tsx'

const fileRequired = s
  .instanceof_(File)
  .refine((file) => file.size > 0, 'Please choose an image')

const uploadSurfaceSchema = f.object({
  name: f.field(surfaceNameSchema),
  description: f.field(s.optional(surfaceDescriptionSchema)),
  image: f.file(fileRequired),
})

export default createController(routes.uploadSurface, {
  actions: {
    index(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)
      return context.render(<UploadSurfacePage user={user} />)
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const verified = await readVerifiedUploadFormData(context)
      if (!verified.success) {
        if (verified.kind === 'csrf') return verified.response
        return context.render(
          <UploadSurfacePage user={user} errors={{ image: verified.error.message }} />,
          { status: verified.error.status },
        )
      }
      const formData = verified.value

      const parsed = s.parseSafe(uploadSurfaceSchema, formData)
      if (!parsed.success) {
        return context.render(
          <UploadSurfacePage
            user={user}
            errors={issuesToFieldErrors(parsed.issues)}
            values={{
              name: String(formData.get('name') ?? ''),
              description: String(formData.get('description') ?? ''),
            }}
          />,
          { status: 400 },
        )
      }

      const { name, description, image } = parsed.value

      let storedImageUrl: string
      try {
        storedImageUrl = await processSurfaceUpload(image)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed'
        return context.render(
          <UploadSurfacePage
            user={user}
            errors={{ image: message }}
            values={{ name, description: description ?? '' }}
          />,
          { status: 400 },
        )
      }

      const db = context.get(Database)
      const now = Date.now()
      const id = randomUUID()
      const slug = generateContentSlug(name)
      await db.create(surfaces, {
        id,
        name,
        slug,
        description: description ?? null,
        image_url: storedImageUrl,
        owner_id: user.id,
        created_at: now,
        updated_at: now,
      })

      return redirect(`/surface/${encodeURIComponent(slug)}`, 303)
    },
  },
})
```

- [ ] **Step 5.9: Run typecheck**

```bash
npm run typecheck
```

Expected: clean. If errors:
- "Cannot find module '../actions/upload-surface/controller.tsx'" — make sure the file was created.
- "Property 'description' missing" on surface creation — verify the schema matches.
- "routes.editSurface" or "routes.removeSurface" errors — you're trying to use a route that's not added yet; remove the references (Task 6 adds them).

- [ ] **Step 5.10: Run smoke + add a basic upload-surface test**

Quick smoke verification via existing test machinery isn't sufficient — we need to add a couple of tests in `test/smoke.test.ts` so this task lands with coverage. Add a new `describe('surfaces', ...)` block. Open `test/smoke.test.ts` and find the existing `describe('stickers', ...)` block as a template.

Add (place at the bottom of the file, before the final closing brace if needed):

```ts
describe('surfaces', () => {
  it('lets an authed user upload a surface and lands on the slug URL', async () => {
    const env = await createTestEnv()
    try {
      await seedUser(env, 'sf-uploader', 'sf-uploaderpass')
      const sessionCookie = await loginAs(env, 'sf-uploader', 'sf-uploaderpass')
      const { token, cookie } = await fetchCsrf(env, routes.uploadSurface.index.href(), sessionCookie)

      // Tiny valid PNG generated by sharp — same pattern used by the
      // existing avatar / sticker upload tests in this file (see
      // `test/smoke.test.ts:350-360` and `:710-720` for reference).
      const sharp = (await import('sharp')).default
      const png = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 64, b: 200 } },
      })
        .png()
        .toBuffer()
      const view = new Uint8Array(new ArrayBuffer(png.byteLength))
      view.set(png)
      const file = new File([view], 'surface.png', { type: 'image/png' })

      const body = new FormData()
      body.set('_csrf', token)
      body.set('name', 'My Laptop')
      body.set('description', 'Years of stickers')
      body.set('image', file)

      const res = await postMultipart(env, routes.uploadSurface.action.href(), { cookie, body })
      assert.equal(res.status, 303)
      const location = res.headers.get('location')
      assert.ok(location && location.startsWith('/surface/my-laptop-'))

      // And the row landed in the DB with the description.
      const uploader = await env.db.findOne(users, { where: { username: 'sf-uploader' } })
      assert.ok(uploader)
      const created = await env.db.findOne(surfaces, { where: { owner_id: uploader.id } })
      assert.ok(created)
      assert.equal(created.name, 'My Laptop')
      assert.equal(created.description, 'Years of stickers')
    } finally {
      env.cleanup()
    }
  })

  it('shows a surface by slug', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'sf-shower', 'sf-showerpass')
      const id = randomUUID()
      const slug = generateContentSlug('My Fridge')
      await env.db.create(surfaces, {
        id,
        name: 'My Fridge',
        slug,
        description: 'lots of magnets and stickers',
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(new Request(buildUrl(routes.surface.href({ slug }))))
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.ok(html.includes('My Fridge'))
      assert.ok(html.includes('lots of magnets and stickers'))
    } finally {
      env.cleanup()
    }
  })

  it('301-redirects /surface/<uuid> to the slug URL', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'sf-rd', 'sf-rdpass')
      const id = randomUUID()
      const slug = generateContentSlug('Vintage Surface')
      await env.db.create(surfaces, {
        id,
        name: 'Vintage Surface',
        slug,
        description: null,
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(new Request(buildUrl(`/surface/${id}`)))
      assert.equal(res.status, 301)
      assert.equal(res.headers.get('location'), `/surface/${slug}`)
    } finally {
      env.cleanup()
    }
  })

  it('returns 404 for /surface/<uuid> with no matching surface', async () => {
    const env = await createTestEnv()
    try {
      const phantom = randomUUID()
      const res = await env.fetch(new Request(buildUrl(`/surface/${phantom}`)))
      assert.equal(res.status, 404)
    } finally {
      env.cleanup()
    }
  })
})
```

Add `surfaces` to the existing import from `'../app/data/schema.ts'` at the top of `test/smoke.test.ts`.

For the upload test's PNG fixture: search the codebase for how existing sticker upload tests construct the file. Look at `test/smoke.test.ts` for `postMultipart` calls with image uploads — there should be a tiny-PNG fixture pattern (or a Buffer of a real minimal PNG). Reuse that. If the existing tests use a real minimal PNG buffer, copy that exact bytes constant.

If the test harness only has `image: '/images/banner.png'` references (static seeded data) and no actual image upload happens in any smoke test, then the upload test should expect the 400 path (image processing rejects the synthetic bytes). That's still a useful test — it verifies the form was accepted past CSRF, validation, and the image hit the processing step.

- [ ] **Step 5.11: Update the test harness to map the upload controller**

Edit `test/helpers.ts`. Find the existing `router.map(routes.uploadSticker, uploadStickerController as any)` line. Add immediately after:

```ts
  router.map(routes.uploadSurface, uploadSurfaceController as any)
```

And add the import at the top:

```ts
import uploadSurfaceController from '../app/actions/upload-surface/controller.tsx'
```

(Alphabetical order with the other controller imports.)

- [ ] **Step 5.12: Run all tests**

```bash
npm test
```

Expected: 58 prior tests + ~4 new surface tests = ~62 passing.

If the upload test's image processing fails (sharp rejects the synthetic bytes), the test asserts `status === 400`. If it succeeds, the redirect assertion fires. Either way the test should pass — but if it does something else (e.g. 500), something is wrong with the controller.

- [ ] **Step 5.13: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5.14: Commit**

```bash
git add app/routes.ts app/router.ts app/actions/ app/ui/surface-card.tsx test/smoke.test.ts test/helpers.ts
git commit -m "add surfaces index, show, upload flow"
```

---

## Task 6: Edit + remove flows

**Files:**
- Modify: `app/routes.ts`
- Modify: `app/router.ts`
- Create: `app/actions/edit-surface/controller.tsx`
- Create: `app/actions/edit-surface-page.tsx`
- Create: `app/actions/remove-surface/controller.tsx`
- Modify: `app/actions/surface-page.tsx` (add the `canEdit` block back)
- Modify: `test/helpers.ts` (wire new controllers)
- Modify: `test/smoke.test.ts` (add edit + remove tests)

- [ ] **Step 6.1: Add edit + remove routes to `app/routes.ts`**

```ts
  editSurface: form('/surface/:slug/edit'),
  removeSurface: form('/profile/:username/remove-surface/:surfaceId'),
```

Place them next to the corresponding sticker routes.

- [ ] **Step 6.2: Create `app/actions/edit-surface-page.tsx`**

Mirror `app/actions/edit-sticker-page.tsx` — show current name + description + image, allow updating name, description, image. Cancel link goes to the show page. Open `edit-sticker-page.tsx` first as a template; adapt the field set to include the description textarea.

```tsx
import { css } from 'remix/ui'

import { Document } from '../ui/document.tsx'
import { Header } from '../ui/header.tsx'
import { Footer } from '../ui/footer.tsx'
import { CsrfField } from '../ui/form.tsx'
import { routes } from '../routes.ts'
import type { AuthedUser } from '../data/current-user.ts'

interface EditSurfacePageProps {
  user: AuthedUser
  surface: {
    id: string
    slug: string
    name: string
    description: string | null
    image_url: string
  }
  flash?: string
  errors?: { name?: string; description?: string; image?: string; _form?: string }
}

const wrapStyle = css({ maxWidth: '500px', margin: '0 auto', padding: '1rem' })
const fieldStyle = css({ display: 'block', marginBottom: '1rem' })
const labelStyle = css({ display: 'block', marginBottom: '0.25rem', fontWeight: '600' })
const inputStyle = css({ width: '100%', padding: '0.5rem', boxSizing: 'border-box' })
const textareaStyle = css({
  width: '100%',
  padding: '0.5rem',
  boxSizing: 'border-box',
  minHeight: '120px',
})
const errorStyle = css({ color: '#c00', marginTop: '0.25rem', fontSize: '0.875rem' })
const flashStyle = css({ color: '#070', marginBottom: '1rem' })
const cancelLinkStyle = css({ marginLeft: '1rem' })
const currentImageStyle = css({
  maxWidth: '100%',
  height: 'auto',
  marginBottom: '0.5rem',
  borderRadius: '4px',
})

export function EditSurfacePage({ user, surface, flash, errors }: EditSurfacePageProps) {
  return (
    <Document title={`Edit ${surface.name} — stickertrade`}>
      <Header user={user} />
      <main mix={wrapStyle}>
        <h1>Edit surface</h1>
        {flash ? <p mix={flashStyle}>{flash}</p> : null}
        <form
          method="post"
          action={routes.editSurface.action.href({ slug: surface.slug })}
          encType="multipart/form-data"
        >
          <CsrfField />
          <label mix={fieldStyle}>
            <span mix={labelStyle}>Name</span>
            <input
              type="text"
              name="name"
              defaultValue={surface.name}
              mix={inputStyle}
              required
              maxLength={80}
            />
            {errors?.name ? <span mix={errorStyle}>{errors.name}</span> : null}
          </label>
          <label mix={fieldStyle}>
            <span mix={labelStyle}>Description (optional)</span>
            <textarea
              name="description"
              defaultValue={surface.description ?? ''}
              mix={textareaStyle}
              maxLength={500}
            />
            {errors?.description ? <span mix={errorStyle}>{errors.description}</span> : null}
          </label>
          <label mix={fieldStyle}>
            <span mix={labelStyle}>Image (leave empty to keep current)</span>
            <img src={surface.image_url} alt="current" mix={currentImageStyle} />
            <input type="file" name="image" accept="image/png,image/jpeg,image/webp" />
            {errors?.image ? <span mix={errorStyle}>{errors.image}</span> : null}
          </label>
          {errors?._form ? <p mix={errorStyle}>{errors._form}</p> : null}
          <button type="submit">Save</button>
          <a href={routes.surface.href({ slug: surface.slug })} mix={cancelLinkStyle}>
            cancel
          </a>
        </form>
      </main>
      <Footer />
    </Document>
  )
}
```

- [ ] **Step 6.3: Create `app/actions/edit-surface/controller.tsx`**

Mirror `app/actions/edit-sticker/controller.tsx`. The shape: GET shows form, POST validates + updates + redirects. Slug is frozen on rename (no slug regeneration). Owner-or-admin gated. UUID-shaped GET param 301-redirects.

```tsx
import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces } from '../../data/schema.ts'
import { looksLikeUuid } from '../../data/slug.ts'
import { processSurfaceUpload } from '../../data/upload-image.ts'
import { uploadStorage } from '../../data/uploads.ts'
import {
  issuesToFieldErrors,
  surfaceDescriptionSchema,
  surfaceNameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { readVerifiedUploadFormData } from '../../utils/upload.ts'
import { EditSurfacePage } from '../edit-surface-page.tsx'

const optionalImage = s
  .optional(s.instanceof_(File))
  .transform((value) => (value && value.size > 0 ? value : undefined))

const editSurfaceSchema = f.object({
  name: f.field(surfaceNameSchema),
  description: f.field(s.optional(surfaceDescriptionSchema)),
  image: f.file(optionalImage),
})

function notFound() {
  return new Response('Not Found', { status: 404 })
}

async function safeRemoveStoredUpload(url: string | null | undefined) {
  if (!url || !url.startsWith('/uploads/')) return
  const key = url.slice('/uploads/'.length)
  try {
    await uploadStorage.remove(key)
  } catch {
    // ignore
  }
}

export default createController(routes.editSurface, {
  actions: {
    async index(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const param = context.params.slug
      if (looksLikeUuid(param)) {
        const byId = await db.findOne(surfaces, { where: { id: param } })
        if (!byId) return notFound()
        return redirect(`/surface/${encodeURIComponent(byId.slug)}/edit`, 301)
      }
      const surface = await db.findOne(surfaces, { where: { slug: param } })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const session = context.get(Session)
      const flash = session.get('surface_flash') as string | undefined
      session.unset('surface_flash')

      return context.render(
        <EditSurfacePage
          user={user}
          surface={{
            id: surface.id,
            slug: surface.slug,
            name: surface.name,
            description: surface.description,
            image_url: surface.image_url,
          }}
          flash={flash}
        />,
      )
    },

    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      // POST: look up by slug only.
      const surface = await db.findOne(surfaces, { where: { slug: context.params.slug } })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const contentType = context.request.headers.get('content-type') ?? ''
      const isMultipart = contentType.startsWith('multipart/form-data')

      let formData: FormData
      if (isMultipart) {
        const verified = await readVerifiedUploadFormData(context)
        if (!verified.success) {
          if (verified.kind === 'csrf') return verified.response
          return context.render(
            <EditSurfacePage
              user={user}
              surface={{
                id: surface.id,
                slug: surface.slug,
                name: surface.name,
                description: surface.description,
                image_url: surface.image_url,
              }}
              errors={{ image: verified.error.message }}
            />,
            { status: verified.error.status },
          )
        }
        formData = verified.value
      } else {
        formData = context.get(FormData)
      }

      const parsed = s.parseSafe(editSurfaceSchema, formData)
      if (!parsed.success) {
        const errors = issuesToFieldErrors(parsed.issues)
        return context.render(
          <EditSurfacePage
            user={user}
            surface={{
              id: surface.id,
              slug: surface.slug,
              name: String(formData.get('name') ?? ''),
              description: String(formData.get('description') ?? '') || null,
              image_url: surface.image_url,
            }}
            errors={errors}
          />,
          { status: 400 },
        )
      }

      const { name, description, image } = parsed.value
      const changes: Partial<{
        name: string
        description: string | null
        image_url: string
        updated_at: number
      }> = {
        name,
        description: description ?? null,
        updated_at: Date.now(),
      }

      if (image) {
        let storedUrl: string
        try {
          storedUrl = await processSurfaceUpload(image)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed'
          return context.render(
            <EditSurfacePage
              user={user}
              surface={{
                id: surface.id,
                slug: surface.slug,
                name,
                description: description ?? null,
                image_url: surface.image_url,
              }}
              errors={{ image: message }}
            />,
            { status: 400 },
          )
        }
        changes.image_url = storedUrl
      }

      await db.update(surfaces, surface.id, changes)
      if (image) await safeRemoveStoredUpload(surface.image_url)

      const session = context.get(Session)
      session.flash('surface_flash', 'Surface updated.')
      return redirect(`/surface/${encodeURIComponent(surface.slug)}`, 303)
    },
  },
})
```

- [ ] **Step 6.4: Create `app/actions/remove-surface/controller.tsx`**

Mirror `app/actions/remove-sticker/controller.tsx`. POST only. Owner-or-admin gated. Looks up by `:surfaceId` (UUID). Deletes the row. Cleans up the stored upload file. Redirects to the owner's profile.

```tsx
import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces } from '../../data/schema.ts'
import { uploadStorage } from '../../data/uploads.ts'
import { routes } from '../../routes.ts'

async function safeRemoveStoredUpload(url: string | null | undefined) {
  if (!url || !url.startsWith('/uploads/')) return
  const key = url.slice('/uploads/'.length)
  try {
    await uploadStorage.remove(key)
  } catch {
    // ignore
  }
}

export default createController(routes.removeSurface, {
  actions: {
    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, { where: { id: context.params.surfaceId } })
      if (!surface) return new Response('Not Found', { status: 404 })
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      await db.delete(surfaces, surface.id)
      await safeRemoveStoredUpload(surface.image_url)

      return redirect(routes.profile.href({ username: context.params.username }), 303)
    },
  },
})
```

- [ ] **Step 6.5: Restore the `canEdit` block in `surface-page.tsx`**

Edit `app/actions/surface-page.tsx`. Reintroduce the `canEdit` prop and the actions block now that the edit and remove routes exist:

In `SurfacePageProps` add:

```ts
  canEdit: boolean
```

In the destructure: `{ user, surface, canEdit, publicOrigin }`.

Below the description, add:

```tsx
        {canEdit ? (
          <div mix={actionsStyle}>
            <a href={routes.editSurface.index.href({ slug: surface.slug })}>edit</a>
            <form
              method="post"
              action={routes.removeSurface.action.href({
                username: surface.owner.username,
                surfaceId: surface.id,
              })}
              style={{ display: 'inline' }}
            >
              <CsrfField />
              <button type="submit">remove</button>
            </form>
          </div>
        ) : null}
```

Add `actionsStyle`:

```ts
const actionsStyle = css({
  marginTop: '1rem',
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'center',
})
```

Add the `CsrfField` import:

```ts
import { CsrfField } from '../ui/form.tsx'
```

- [ ] **Step 6.6: Update the root controller's `surface` action to pass `canEdit`**

Edit `app/actions/controller.tsx`. In the `surface` action's render call, add:

```ts
canEdit: Boolean(getCurrentUser(context)) && (
  getCurrentUser(context)?.id === surface.owner_id ||
  getCurrentUser(context)?.role === 'ADMIN'
),
```

(Or compute the current user once, store in a local, and reference it twice.)

- [ ] **Step 6.7: Wire new controllers in `app/router.ts`**

Add imports and mappings for `editSurface` and `removeSurface`:

```ts
import editSurfaceController from './actions/edit-surface/controller.tsx'
import removeSurfaceController from './actions/remove-surface/controller.tsx'

// ...

router.map(routes.editSurface, editSurfaceController)
router.map(routes.removeSurface, removeSurfaceController)
```

- [ ] **Step 6.8: Wire new controllers in `test/helpers.ts`**

Same additions in the test harness.

- [ ] **Step 6.9: Add edit + remove tests to `test/smoke.test.ts`**

Add to the `describe('surfaces', ...)` block:

```ts
  it('lets the owner rename a surface and keeps the slug frozen', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'sf-renamer', 'sf-renamerpass')
      const id = randomUUID()
      const originalName = 'Old Name'
      const slug = generateContentSlug(originalName)
      await env.db.create(surfaces, {
        id,
        name: originalName,
        slug,
        description: null,
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const sessionCookie = await loginAs(env, 'sf-renamer', 'sf-renamerpass')
      const { token, cookie } = await fetchCsrf(
        env,
        routes.editSurface.index.href({ slug }),
        sessionCookie,
      )
      const body = new FormData()
      body.set('_csrf', token)
      body.set('name', 'New Shiny Name')
      body.set('description', 'now with words')
      const res = await postForm(env, routes.editSurface.action.href({ slug }), { cookie, body })
      assert.equal(res.status, 303)
      assert.equal(res.headers.get('location'), `/surface/${slug}`)

      const updated = await env.db.findOne(surfaces, { where: { id } })
      assert.ok(updated)
      assert.equal(updated.name, 'New Shiny Name')
      assert.equal(updated.description, 'now with words')
      assert.equal(updated.slug, slug, 'slug should be frozen on rename')
    } finally {
      env.cleanup()
    }
  })

  it('refuses edits by non-owner non-admin users', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'sf-owner', 'sf-ownerpass')
      await seedUser(env, 'sf-intruder', 'sf-intruderpass')
      const id = randomUUID()
      const slug = generateContentSlug('Guarded')
      await env.db.create(surfaces, {
        id,
        name: 'Guarded',
        slug,
        description: null,
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const sessionCookie = await loginAs(env, 'sf-intruder', 'sf-intruderpass')
      const res = await env.fetch(
        new Request(buildUrl(routes.editSurface.index.href({ slug })), {
          headers: { cookie: sessionCookie },
        }),
      )
      assert.equal(res.status, 403)
    } finally {
      env.cleanup()
    }
  })

  it('lets the owner remove a surface', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'sf-deleter', 'sf-deleterpass')
      const id = randomUUID()
      const slug = generateContentSlug('Goner')
      await env.db.create(surfaces, {
        id,
        name: 'Goner',
        slug,
        description: null,
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const sessionCookie = await loginAs(env, 'sf-deleter', 'sf-deleterpass')
      const { token, cookie } = await fetchCsrf(
        env,
        routes.surface.href({ slug }),
        sessionCookie,
      )
      const body = new FormData()
      body.set('_csrf', token)
      const res = await postForm(
        env,
        routes.removeSurface.action.href({ username: 'sf-deleter', surfaceId: id }),
        { cookie, body },
      )
      assert.equal(res.status, 303)

      const remaining = await env.db.findOne(surfaces, { where: { id } })
      assert.equal(remaining, null)
    } finally {
      env.cleanup()
    }
  })
```

- [ ] **Step 6.10: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6.11: Run tests**

```bash
npm test
```

Expected: ~62 + 3 new = ~65 passing.

- [ ] **Step 6.12: Commit**

```bash
git add app/routes.ts app/router.ts app/actions/edit-surface/ app/actions/edit-surface-page.tsx app/actions/remove-surface/ app/actions/surface-page.tsx app/actions/controller.tsx test/helpers.ts test/smoke.test.ts
git commit -m "add edit + remove surface flows"
```

---

## Task 7: Profile + home page integration

**Files:**
- Modify: `app/actions/controller.tsx` (profile + home actions)
- Modify: `app/actions/profile-page.tsx`
- Modify: `app/actions/home-page.tsx`
- Modify: `test/smoke.test.ts`

- [ ] **Step 7.1: Extend the `profile` action to fetch surfaces**

Edit `app/actions/controller.tsx`. In the `profile` action, after fetching the user's stickers, add a parallel query for surfaces:

```ts
const profileSurfaces = await db.findMany(surfaces, {
  where: { owner_id: profileUser.id },
  orderBy: ['created_at', 'desc'],
})
```

Then in the render call, add a `surfaces` prop:

```tsx
surfaces: profileSurfaces.map((s) => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  description: s.description,
  image_url: s.image_url,
  owner: { username: profileUser.username, avatar_url: profileUser.avatar_url ?? null },
})),
```

- [ ] **Step 7.2: Update `app/actions/profile-page.tsx` to render the surfaces section**

Edit `app/actions/profile-page.tsx`. Add `surfaces` to the `profile` prop type:

```ts
profile: {
  username: string
  avatar_url: string | null
  stickers: Array<...>  // existing
  surfaces: Array<{
    id: string
    slug: string
    name: string
    description: string | null
    image_url: string
    owner: { username: string; avatar_url: string | null }
  }>
}
```

Add the import:

```ts
import { SurfaceCard } from '../ui/surface-card.tsx'
```

Below the existing stickers grid, add the surfaces section:

```tsx
{profile.surfaces.length > 0 ? (
  <section mix={surfacesSectionStyle}>
    <h2>Surfaces ({profile.surfaces.length})</h2>
    {profile.surfaces.map((s) => (
      <SurfaceCard key={s.id} surface={s} />
    ))}
  </section>
) : null}
```

Add the style:

```ts
const surfacesSectionStyle = css({ marginTop: '2rem', maxWidth: '600px' })
```

- [ ] **Step 7.3: Extend the `home` action to compute Surface of the Day**

Edit `app/actions/controller.tsx`. Imports:

```ts
import { getSurfaceOfTheDay } from '../data/surface-of-the-day.ts'
```

In the `home` action, after the existing sticker queries:

```ts
const sotd = await getSurfaceOfTheDay(db)
let sotdProp = null
if (sotd) {
  const owner = await db.findOne(users, { where: { id: sotd.owner_id } })
  if (owner) {
    sotdProp = {
      id: sotd.id,
      slug: sotd.slug,
      name: sotd.name,
      description: sotd.description,
      image_url: sotd.image_url,
      owner: { username: owner.username, avatar_url: owner.avatar_url ?? null },
    }
  }
}
```

Then pass `surfaceOfTheDay={sotdProp}` to `<HomePage />`.

- [ ] **Step 7.4: Update `app/actions/home-page.tsx`**

Add the prop type:

```ts
surfaceOfTheDay: {
  id: string
  slug: string
  name: string
  description: string | null
  image_url: string
  owner: { username: string; avatar_url: string | null }
} | null
```

Add the import:

```ts
import { SurfaceCard } from '../ui/surface-card.tsx'
```

Above the existing recent-stickers grid, render the SotD block:

```tsx
{surfaceOfTheDay ? (
  <section mix={sotdSectionStyle}>
    <h2 mix={sotdHeadingStyle}>Surface of the Day</h2>
    <SurfaceCard surface={surfaceOfTheDay} />
  </section>
) : null}
```

Add the styles:

```ts
const sotdSectionStyle = css({
  marginBottom: '2.5rem',
  maxWidth: '800px',
  margin: '0 auto 2.5rem',
})
const sotdHeadingStyle = css({ margin: '0 0 1rem' })
```

- [ ] **Step 7.5: Add tests**

Add to `test/smoke.test.ts`, inside the `describe('surfaces', ...)` block:

```ts
  it('renders surfaces on the profile page', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'sf-profile', 'sf-profilepass')
      const slug = generateContentSlug('On Profile')
      await env.db.create(surfaces, {
        id: randomUUID(),
        name: 'On Profile',
        slug,
        description: 'visible on profile',
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(
        new Request(buildUrl(routes.profile.href({ username: 'sf-profile' }))),
      )
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.ok(html.includes('On Profile'))
      assert.ok(html.includes('Surfaces (1)'))
    } finally {
      env.cleanup()
    }
  })

  it('renders the surface of the day on the home page when one exists', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'sf-sotd', 'sf-sotdpass')
      const slug = generateContentSlug('Daily Pick')
      await env.db.create(surfaces, {
        id: randomUUID(),
        name: 'Daily Pick',
        slug,
        description: null,
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(new Request(buildUrl('/')))
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.ok(html.includes('Surface of the Day'))
      assert.ok(html.includes('Daily Pick'))
    } finally {
      env.cleanup()
    }
  })

  it('omits the surface of the day block when there are no surfaces', async () => {
    const env = await createTestEnv()
    try {
      const res = await env.fetch(new Request(buildUrl('/')))
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.ok(!html.includes('Surface of the Day'))
    } finally {
      env.cleanup()
    }
  })
```

- [ ] **Step 7.6: Run typecheck + tests**

```bash
npm run typecheck && npm test
```

Expected: clean + ~65 + 3 = ~68 passing.

- [ ] **Step 7.7: Commit**

```bash
git add app/actions/controller.tsx app/actions/profile-page.tsx app/actions/home-page.tsx test/smoke.test.ts
git commit -m "wire surfaces into profile + home pages"
```

---

## Task 8: Admin moderation

**Files:**
- Modify: `app/routes.ts`
- Modify: `app/actions/admin/controller.tsx`
- Create: `app/actions/admin/admin-surfaces-page.tsx`
- Modify: `test/smoke.test.ts`

- [ ] **Step 8.1: Add admin routes**

Edit `app/routes.ts`. Inside the existing `admin` route block:

```ts
  admin: route('/admin', {
    // ...existing keys...
    surfaces: get('/surfaces'),
    deleteSurface: post('/surfaces/:id/delete'),
  }),
```

- [ ] **Step 8.2: Create `app/actions/admin/admin-surfaces-page.tsx`**

Mirror `app/actions/admin/admin-stickers-page.tsx`. Paginated table of all surfaces, per-row delete button.

```tsx
import { css } from 'remix/ui'

import { Document } from '../../ui/document.tsx'
import { Header } from '../../ui/header.tsx'
import { Footer } from '../../ui/footer.tsx'
import { CsrfField } from '../../ui/form.tsx'
import { routes } from '../../routes.ts'
import type { AuthedUser } from '../../data/current-user.ts'

interface AdminSurfaceRow {
  id: string
  slug: string
  name: string
  image_url: string
  owner: { username: string; avatar_url: string | null } | null
  createdRelative: string
}

interface AdminSurfacesPageProps {
  user: AuthedUser
  page: number
  hasNext: boolean
  surfaces: AdminSurfaceRow[]
}

const wrapStyle = css({ maxWidth: '900px', margin: '0 auto', padding: '1rem' })
const tableStyle = css({ width: '100%', borderCollapse: 'collapse' })
const cellStyle = css({ padding: '0.5rem', borderBottom: '1px solid #eee', verticalAlign: 'top' })
const thumbStyle = css({ width: '80px', height: 'auto', borderRadius: '4px' })

export function AdminSurfacesPage({ user, page, hasNext, surfaces }: AdminSurfacesPageProps) {
  return (
    <Document title="Admin · Surfaces — stickertrade">
      <Header user={user} />
      <main mix={wrapStyle}>
        <h1>Admin · Surfaces</h1>
        <table mix={tableStyle}>
          <thead>
            <tr>
              <th mix={cellStyle}>Image</th>
              <th mix={cellStyle}>Name</th>
              <th mix={cellStyle}>Owner</th>
              <th mix={cellStyle}>Created</th>
              <th mix={cellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {surfaces.map((s) => (
              <tr key={s.id}>
                <td mix={cellStyle}>
                  <a href={routes.surface.href({ slug: s.slug })}>
                    <img src={s.image_url} alt={s.name} mix={thumbStyle} />
                  </a>
                </td>
                <td mix={cellStyle}>
                  <a href={routes.surface.href({ slug: s.slug })}>{s.name}</a>
                </td>
                <td mix={cellStyle}>{s.owner?.username ?? '(deleted)'}</td>
                <td mix={cellStyle}>{s.createdRelative}</td>
                <td mix={cellStyle}>
                  <form
                    method="post"
                    action={routes.admin.deleteSurface.href({ id: s.id })}
                  >
                    <CsrfField />
                    <button type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          {page > 0 ? (
            <a href={`${routes.admin.surfaces.href()}?page=${page - 1}`}>« prev</a>
          ) : null}
          {hasNext ? (
            <a href={`${routes.admin.surfaces.href()}?page=${page + 1}`}>next »</a>
          ) : null}
        </p>
      </main>
      <Footer />
    </Document>
  )
}
```

- [ ] **Step 8.3: Extend `app/actions/admin/controller.tsx`**

Add imports:

```ts
import { surfaces } from '../../data/schema.ts'
import { AdminSurfacesPage } from './admin-surfaces-page.tsx'
```

Add two new actions:

```ts
    async surfaces(context) {
      const check = ensureAdmin(context)
      if (check.response) return check.response
      const user = check.user!

      const db = context.get(Database)
      const page = readPage(context.url)
      const rows = await db.findMany(surfaces, {
        orderBy: ['updated_at', 'desc'],
        limit: PAGE_SIZE + 1,
        offset: page * PAGE_SIZE,
      })
      const hasNext = rows.length > PAGE_SIZE
      const slice = rows.slice(0, PAGE_SIZE)

      const ownerIds = Array.from(new Set(slice.map((s) => s.owner_id)))
      const ownerRows = ownerIds.length
        ? await db.findMany(users, { where: inList('id', ownerIds) })
        : []
      const ownerById = new Map(ownerRows.map((o) => [o.id, o]))

      return context.render(
        <AdminSurfacesPage
          user={user}
          page={page}
          hasNext={hasNext}
          surfaces={slice.map((s) => {
            const owner = ownerById.get(s.owner_id) ?? null
            return {
              id: s.id,
              slug: s.slug,
              name: s.name,
              image_url: s.image_url,
              owner: owner ? { username: owner.username, avatar_url: owner.avatar_url ?? null } : null,
              createdRelative: formatRelative(s.created_at),
            }
          })}
        />,
      )
    },

    async deleteSurface(context) {
      const check = ensureAdmin(context)
      if (check.response) return check.response

      const db = context.get(Database)
      await db.delete(surfaces, context.params.id)
      return redirect(routes.admin.surfaces.href(), 303)
    },
```

- [ ] **Step 8.4: Add admin test**

Add to `test/smoke.test.ts`:

```ts
  it('lets an admin delete a surface', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'sf-victim', 'sf-victimpass')
      const adminId = await seedUser(env, 'sf-admin', 'sf-adminpass')
      await env.db.update(users, adminId, { role: 'ADMIN' })

      const id = randomUUID()
      await env.db.create(surfaces, {
        id,
        name: 'To Be Deleted',
        slug: generateContentSlug('To Be Deleted'),
        description: null,
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const sessionCookie = await loginAs(env, 'sf-admin', 'sf-adminpass')
      const { token, cookie } = await fetchCsrf(env, routes.admin.surfaces.href(), sessionCookie)
      const res = await postForm(env, routes.admin.deleteSurface.href({ id }), {
        cookie,
        body: { _csrf: token },
      })
      assert.equal(res.status, 303)

      const remaining = await env.db.findOne(surfaces, { where: { id } })
      assert.equal(remaining, null)
    } finally {
      env.cleanup()
    }
  })
```

- [ ] **Step 8.5: Run typecheck + tests**

```bash
npm run typecheck && npm test
```

Expected: clean + ~69 passing.

- [ ] **Step 8.6: Commit**

```bash
git add app/routes.ts app/actions/admin/ test/smoke.test.ts
git commit -m "admin surfaces moderation page"
```

---

## Task 9: JSON API

**Files:**
- Modify: `app/routes.ts`
- Modify: `app/actions/api/serializers.ts`
- Modify: `app/actions/api/controller.tsx`
- Modify: `test/smoke.test.ts`

- [ ] **Step 9.1: Add API routes**

Edit `app/routes.ts`. Inside the existing `api` route block, before the `notFound` catch-all:

```ts
  api: route('/api', {
    // ...existing keys...
    surfacesIndex: get('/surfaces'),
    surfaceShow: get('/surfaces/:id'),
    surfaceCreate: post('/surfaces'),
    surfaceUpdate: patch('/surfaces/:id'),
    surfaceDestroy: del('/surfaces/:id'),
    userSurfaces: get('/users/:username/surfaces'),
    notFound: '/*path',
  }),
```

- [ ] **Step 9.2: Add serializer**

Edit `app/actions/api/serializers.ts`. Add the import:

```ts
import type { Surface } from '../../data/schema.ts'
```

Add the interface and serializer:

```ts
export interface JsonSurface {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string
  owner: JsonUserStub
  created_at: number
  updated_at: number
}

export function serializeSurface(
  surface: Surface,
  owner: Pick<User, 'username' | 'avatar_url'>,
): JsonSurface {
  return {
    id: surface.id,
    name: surface.name,
    slug: surface.slug,
    description: surface.description,
    image_url: surface.image_url,
    owner: serializeUserStub(owner),
    created_at: surface.created_at,
    updated_at: surface.updated_at,
  }
}
```

- [ ] **Step 9.3: Add API actions**

Edit `app/actions/api/controller.tsx`. Add imports:

```ts
import { surfaces } from '../../data/schema.ts'
import { generateContentSlug } from '../../data/slug.ts'
import { processSurfaceUpload } from '../../data/upload-image.ts'
import { surfaceDescriptionSchema, surfaceNameSchema } from '../../data/validators.ts'
import { serializeSurface } from './serializers.ts'
```

Add the create schema:

```ts
const apiSurfaceCreateSchema = f.object({
  name: f.field(surfaceNameSchema),
  description: f.field(s.optional(surfaceDescriptionSchema)),
  image: f.file(
    s.instanceof_(File).refine((file) => file.size > 0, 'Please attach an image'),
  ),
})
```

Add six new actions inside the `actions` object (mirror the sticker actions exactly — index, show, create, update, destroy, userSurfaces). Use the sticker code as the template; the changes are: `stickers` → `surfaces`, `processStickerUpload` → `processSurfaceUpload`, sticker name validator → surface name validator, owner is non-null (surfaces.owner_id is NOT NULL).

For the index action, mirror `stickersIndex`:

```ts
    async surfacesIndex(context) {
      const db = context.get(Database)
      const page = readPage(context.url)
      const rows = await db.findMany(surfaces, {
        orderBy: ['created_at', 'desc'],
        limit: PAGE_SIZE + 1,
        offset: page * PAGE_SIZE,
      })
      const hasMore = rows.length > PAGE_SIZE
      const slice = rows.slice(0, PAGE_SIZE)
      const ownerIds = Array.from(new Set(slice.map((s) => s.owner_id)))
      const ownerRows = ownerIds.length
        ? await db.findMany(users, { where: inList('id', ownerIds) })
        : []
      const ownerById = new Map(ownerRows.map((u) => [u.id, u]))
      return jsonOk({
        surfaces: slice.map((s) => {
          const owner = ownerById.get(s.owner_id)
          if (!owner) {
            // Shouldn't happen due to FK CASCADE, but fall back to a stub.
            return serializeSurface(s, { username: 'unknown', avatar_url: null })
          }
          return serializeSurface(s, owner)
        }),
        page,
        has_more: hasMore,
      })
    },
```

For show:

```ts
    async surfaceShow(context) {
      const db = context.get(Database)
      const surface = await db.findOne(surfaces, { where: { id: context.params.id } })
      if (!surface) return jsonError(404, 'Not Found')
      const owner = await db.findOne(users, { where: { id: surface.owner_id } })
      if (!owner) return jsonError(404, 'Not Found')
      return jsonOk({ surface: serializeSurface(surface, owner) })
    },
```

For create — mirror `stickerCreate`, adapt to surfaces, add description handling, generate slug via `generateContentSlug`:

```ts
    async surfaceCreate(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const uploadParsed = await readUploadFormData(context.request)
      if (!uploadParsed.success) {
        return jsonError(uploadParsed.error.status, uploadParsed.error.code, {
          message: uploadParsed.error.message,
          ...uploadParsed.error.extras,
        })
      }

      const parsed = s.parseSafe(apiSurfaceCreateSchema, uploadParsed.value)
      if (!parsed.success) {
        return jsonError(400, 'Validation failed', { issues: parsed.issues })
      }
      const { name, description, image } = parsed.value

      let storedImageUrl: string
      try {
        storedImageUrl = await processSurfaceUpload(image)
      } catch (error) {
        if (error instanceof ProcessImageError) {
          const status = error.code === 'file_too_large' ? 413 : 400
          return jsonError(status, error.code, { message: error.message })
        }
        return jsonError(400, 'upload_failed', {
          message: error instanceof Error ? error.message : 'Upload failed',
        })
      }

      const db = context.get(Database)
      const now = Date.now()
      const id = randomUUID()
      const slug = generateContentSlug(name)
      await db.create(surfaces, {
        id,
        name,
        slug,
        description: description ?? null,
        image_url: storedImageUrl,
        owner_id: user.id,
        created_at: now,
        updated_at: now,
      })
      const created = await db.findOne(surfaces, { where: { id } })
      return jsonOk({ surface: serializeSurface(created!, user as never) }, { status: 201 })
    },
```

For update — mirror `stickerUpdate`. Accepts JSON or form body. Updates name + description.

```ts
    async surfaceUpdate(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, { where: { id: context.params.id } })
      if (!surface) return jsonError(404, 'Not Found')
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return jsonError(403, 'Forbidden')
      }

      let rawName: unknown
      let rawDescription: unknown
      const contentType = context.request.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        try {
          const payload = (await context.request.json()) as {
            name?: unknown
            description?: unknown
          }
          rawName = payload.name
          rawDescription = payload.description
        } catch {
          return jsonError(400, 'Invalid JSON body')
        }
      } else {
        const fd = context.get(FormData)
        rawName = fd.get('name')
        rawDescription = fd.get('description')
      }

      const nameResult = s.parseSafe(surfaceNameSchema, rawName)
      if (!nameResult.success) {
        return jsonError(400, 'Validation failed', { issues: nameResult.issues })
      }
      const changes: { name: string; description?: string | null; updated_at: number } = {
        name: nameResult.value,
        updated_at: Date.now(),
      }
      if (rawDescription !== undefined) {
        const descResult = s.parseSafe(surfaceDescriptionSchema, String(rawDescription ?? ''))
        if (!descResult.success) {
          return jsonError(400, 'Validation failed', { issues: descResult.issues })
        }
        changes.description = descResult.value
      }

      await db.update(surfaces, surface.id, changes)
      const updated = await db.findOne(surfaces, { where: { id: surface.id } })
      const owner = await db.findOne(users, { where: { id: updated!.owner_id } })
      return jsonOk({ surface: serializeSurface(updated!, owner!) })
    },
```

For destroy — mirror `stickerDestroy`:

```ts
    async surfaceDestroy(context) {
      const user = getCurrentUser(context)
      if (!user) return jsonError(401, 'Unauthorized')

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, { where: { id: context.params.id } })
      if (!surface) return jsonError(404, 'Not Found')
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return jsonError(403, 'Forbidden')
      }
      await db.delete(surfaces, surface.id)
      await safeRemoveStoredUpload(surface.image_url)
      return new Response(null, { status: 204 })
    },
```

For userSurfaces — mirror `userStickers`:

```ts
    async userSurfaces(context) {
      const db = context.get(Database)
      const u = await db.findOne(users, { where: { username: context.params.username } })
      if (!u) return jsonError(404, 'Not Found')
      const rows = await db.findMany(surfaces, {
        where: { owner_id: u.id },
        orderBy: ['created_at', 'desc'],
      })
      return jsonOk({
        user: serializeUserStub(u),
        surfaces: rows.map((s) => serializeSurface(s, u)),
      })
    },
```

- [ ] **Step 9.4: Add API tests**

Add to `test/smoke.test.ts` (in the existing `describe('api', ...)` block, or a new one if you prefer):

```ts
  it('GET /api/surfaces lists surfaces', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'sf-api', 'sf-apipass')
      await env.db.create(surfaces, {
        id: randomUUID(),
        name: 'API Surface',
        slug: generateContentSlug('API Surface'),
        description: null,
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(new Request(buildUrl(routes.api.surfacesIndex.href())))
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.ok(Array.isArray(body.surfaces))
      assert.equal(body.surfaces.length, 1)
      assert.equal(body.surfaces[0].name, 'API Surface')
      assert.ok(body.surfaces[0].slug)
    } finally {
      env.cleanup()
    }
  })

  it('GET /api/users/:username/surfaces returns the user surfaces', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'sf-byuser', 'sf-byuserpass')
      await env.db.create(surfaces, {
        id: randomUUID(),
        name: 'ByUser Surface',
        slug: generateContentSlug('ByUser Surface'),
        description: null,
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(
        new Request(buildUrl(routes.api.userSurfaces.href({ username: 'sf-byuser' }))),
      )
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.surfaces.length, 1)
      assert.equal(body.surfaces[0].name, 'ByUser Surface')
    } finally {
      env.cleanup()
    }
  })

  it('PATCH /api/surfaces/:id rejects non-owner', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'sf-ownerapi', 'sf-ownerapi-pass')
      await seedUser(env, 'sf-intruderapi', 'sf-intruderapi-pass')
      const id = randomUUID()
      await env.db.create(surfaces, {
        id,
        name: 'Locked',
        slug: generateContentSlug('Locked'),
        description: null,
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      // Create a bearer token for the intruder
      const intruderCookie = await loginAs(env, 'sf-intruderapi', 'sf-intruderapi-pass')
      const { token, cookie } = await fetchCsrf(env, routes.profile.href({ username: 'sf-intruderapi' }), intruderCookie)
      const tokenRes = await postForm(env, routes.createApiToken.href(), {
        cookie,
        body: { _csrf: token, name: 'test' },
      })
      assert.equal(tokenRes.status, 200)
      // The token plaintext is rendered on the response page once. Parse it out.
      const tokenHtml = await tokenRes.text()
      const match = tokenHtml.match(/st_[a-f0-9]{48}/)
      assert.ok(match, 'expected a plaintext API token in the response')
      const apiToken = match[0]

      const res = await env.fetch(
        new Request(buildUrl(routes.api.surfaceUpdate.href({ id })), {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({ name: 'Hijacked' }),
        }),
      )
      assert.equal(res.status, 403)
    } finally {
      env.cleanup()
    }
  })
```

(That last test parses the plaintext token from the `createApiToken` response page. Open `test/smoke.test.ts` to see how the existing api token tests do this — copy that pattern exactly to avoid drift.)

- [ ] **Step 9.5: Run typecheck + tests**

```bash
npm run typecheck && npm test
```

Expected: clean + ~72 passing.

- [ ] **Step 9.6: Commit**

```bash
git add app/routes.ts app/actions/api/ test/smoke.test.ts
git commit -m "add surfaces JSON API"
```

---

## Task 10: Roadmap, browser verification, PR

**Files:**
- Modify: `app/data/roadmap.ts`

- [ ] **Step 10.1: Add roadmap entry**

Edit `app/data/roadmap.ts`. Find the "Recently shipped" section. Add (after the slug-URLs entry):

```ts
  {
    title: 'Sticker surfaces 🎒',
    description: md(`
- [x] New \`surfaces\` content type — photos of stickered real-world objects
- [x] Profile pages show a user's surfaces below their stickers
- [x] Randomized "Surface of the Day" on the home page (lazy-on-demand, UTC daily)
- [x] Pick history persisted in \`surface_features\` (archive page comes later)
- [x] JSON API endpoints + admin moderation
`),
  },
```

- [ ] **Step 10.2: Run final verification**

```bash
npm run typecheck && npm test
```

Expected: clean + ~72 passing (no change from Task 9).

- [ ] **Step 10.3: Manual browser verification**

```bash
SESSION_SECRET=dev npm run migrate
SESSION_SECRET=dev nohup npm run dev > /tmp/dev-server.log 2>&1 &
echo $! > /tmp/dev-server.pid
sleep 4
```

Sanity-check via curl (no need to drive Chrome unless something looks wrong):

- `curl -i http://localhost:<port>/surfaces` returns 200 and shows "No surfaces yet" (because none exist yet).
- `curl -i http://localhost:<port>/` returns 200 and does NOT include "Surface of the Day".
- Log in as the seeded admin (`admin` / `changeme`). Hit `/upload-surface`. Upload a real image with name + description. Verify the redirect goes to `/surface/<name>-<6chars>`.
- Visit the slug URL — surface renders.
- Visit `/` — Surface of the Day block appears with the surface.
- Visit `/sticker/<some-uuid-of-the-new-surface>` — wait, that should be `/surface/<uuid>` — verify the 301 redirect to the slug URL.
- Visit `/profile/admin` — surfaces section appears below stickers.
- Visit `/admin/surfaces` — admin moderation table shows the surface; per-row delete works.

Stop the server:

```bash
kill $(cat /tmp/dev-server.pid) 2>/dev/null
rm /tmp/dev-server.pid
```

- [ ] **Step 10.4: Commit roadmap**

```bash
git add app/data/roadmap.ts
git commit -m "roadmap: mark sticker surfaces shipped"
```

- [ ] **Step 10.5: Push branch**

```bash
git push -u origin sticker-surfaces
```

- [ ] **Step 10.6: Open PR**

```bash
gh pr create \
  --base main \
  --head sticker-surfaces \
  --title "sticker surfaces: photos of stickered real-world objects + Surface of the Day" \
  --body "$(cat <<'EOF'
Add a new content type — surfaces — distinct from tradeable stickers.

A surface is a photograph of a real-world object (laptop, fridge, water bottle, car) covered in stickers the owner has already applied. Surfaces appear on profiles in a more full-fat display (preserve native aspect ratio, single-column stack) and the home page now features a randomized "Surface of the Day."

## What changed

- New tables: `surfaces`, `surface_features` (persisted daily-pick history).
- Public pages: `/surfaces`, `/surface/:slug`.
- Auth-gated pages: `/upload-surface`, `/surface/:slug/edit`.
- Form actions (UUID): `/profile/:username/remove-surface/:surfaceId`, admin delete.
- JSON API endpoints + admin moderation.
- Renamed `generateStickerSlug` → `generateContentSlug` (function was never sticker-specific).

## Surface of the Day

Lazy on-demand. First request of the UTC day picks uniformly at random from all surfaces and persists the pick to `surface_features`. Subsequent requests read the cached row. If the cached pick gets deleted mid-day, the stale row drops and a fresh pick rolls on the next request. Race-safe via `UNIQUE(featured_date)`.

Pick history persists indefinitely so we can ship an archive page later.

## What did NOT change

- Stickers are unaffected.
- Trading, sticker URLs, sticker schema all untouched.

## Verification

- All prior tests pass. ~20 new tests across surfaces CRUD, redirects, profile/home integration, admin, API, and the daily-pick algorithm (5 isolated unit tests in `test/surface-of-the-day.test.ts`).
- Typecheck clean.
- Browser-verified end-to-end.

## Design + plan

- Spec: `docs/superpowers/specs/2026-06-03-sticker-surfaces-design.md`
- Plan: `docs/superpowers/plans/2026-06-03-sticker-surfaces.md`
EOF
)"
```

- [ ] **Step 10.7: Report the PR URL**

