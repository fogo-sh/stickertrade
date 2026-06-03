# Sticker Slugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UUID-based public sticker URLs (`/sticker/<uuid>`) with name-derived slug URLs (`/sticker/dino-sticker-k3p9aq`), with a 301 redirect from the old form for backwards compatibility.

**Architecture:** Add a `slug` column to the `stickers` table (one SQL migration that adds the column, backfills name-derived slugs for existing rows, and creates a unique index). Route contract changes from `:id` to `:slug`. Show/edit controllers look up by slug, with a UUID-shaped param redirected to the slug URL. All form action endpoints, the JSON API, and admin routes keep their UUID params unchanged.

**Tech Stack:** Remix 3, `remix/data-table` (SQLite via `node:sqlite`), pure-SQL migrations via `remix/data-table/migrations/node`, `node:crypto` for the random suffix, `node:test` for tests.

**Spec:** `docs/superpowers/specs/2026-06-03-sticker-slugs-design.md`

**Working branch:** `sticker-slugs` (already checked out)

---

## File Structure

**Create:**
- `app/data/slug.ts` — pure-function `slugifyName` and `generateStickerSlug`
- `app/data/slug.test.ts` — unit tests for the above
- `migrations/20260603000000_add_sticker_slug/up.sql` — schema change + backfill + unique index
- `migrations/20260603000000_add_sticker_slug/down.sql` — drop index + drop column
- `test/migrations.test.ts` — end-to-end backfill test

**Modify:**
- `app/data/schema.ts` — add `slug` column to `stickers` table definition
- `app/routes.ts` — change `:id` to `:slug` for `sticker` and `editSticker`
- `app/actions/controller.tsx` — sticker show: look up by slug, redirect from UUID
- `app/actions/edit-sticker/controller.tsx` — edit GET + POST: look up by slug, redirect from UUID on GET
- `app/actions/upload-sticker/controller.tsx` — generate slug on create, redirect to slug URL
- `app/ui/sticker-card.tsx` — link by slug
- `app/actions/admin/admin-stickers-page.tsx` — link by slug
- `app/actions/sticker-page.tsx` — OG canonical URL uses slug
- `app/actions/edit-sticker-page.tsx` — cancel link uses slug
- `test/smoke.test.ts` — existing edit-sticker tests use slug; add new tests for redirect + 404
- `app/data/roadmap.ts` — add roadmap entry under "Recently shipped"

**Do NOT modify** (intentionally — these keep UUID params):
- `app/actions/api/controller.tsx` (JSON API)
- `app/actions/admin/controller.tsx` (admin delete routes)
- `app/actions/remove-sticker/controller.tsx` (form POST target)
- `app/actions/invitations/controller.tsx`, `invitation/controller.tsx`
- The `removeSticker`, `createApiToken`, `revokeApiToken`, admin routes in `app/routes.ts`

---

## Task 1: Pure-function slug helpers

**Files:**
- Create: `app/data/slug.ts`
- Test: `app/data/slug.test.ts`

- [ ] **Step 1.1: Write the failing test file**

Create `app/data/slug.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { generateStickerSlug, slugifyName } from './slug.ts'

describe('slugifyName', () => {
  it('lowercases and hyphenates spaces', () => {
    assert.equal(slugifyName('Dino Sticker'), 'dino-sticker')
  })

  it('strips non-alphanumeric chars and collapses runs of hyphens', () => {
    assert.equal(slugifyName('coffee & code'), 'coffee-code')
    assert.equal(slugifyName('foo!!!bar???baz'), 'foo-bar-baz')
  })

  it('trims leading and trailing hyphens', () => {
    assert.equal(slugifyName('---hello---'), 'hello')
    assert.equal(slugifyName('   spaced   '), 'spaced')
  })

  it('returns an empty string for all-non-ASCII names', () => {
    assert.equal(slugifyName('🦖'), '')
    assert.equal(slugifyName('🦖 🔥 🦖'), '')
  })

  it('caps at 40 chars and re-trims trailing hyphen left by the cut', () => {
    const longName = 'a'.repeat(200)
    assert.equal(slugifyName(longName), 'a'.repeat(40))
    const oddCut = 'a'.repeat(39) + ' ' + 'b'.repeat(50)
    // 'aaaa...aaa-bbbb...' — first 40 chars is 39 a's + '-' which trims to 39 a's
    assert.equal(slugifyName(oddCut), 'a'.repeat(39))
  })
})

describe('generateStickerSlug', () => {
  it('produces <slug-part>-<6 lowercase alphanumerics>', () => {
    const slug = generateStickerSlug('Dino Sticker')
    assert.match(slug, /^dino-sticker-[a-z0-9]{6}$/)
  })

  it('produces just the suffix when the name slugifies to empty', () => {
    const slug = generateStickerSlug('🦖')
    assert.match(slug, /^[a-z0-9]{6}$/)
  })

  it('produces different suffixes across calls', () => {
    const a = generateStickerSlug('test')
    const b = generateStickerSlug('test')
    assert.notEqual(a, b)
  })
})
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern='slugify|generateStickerSlug'`

Expected: FAIL — `app/data/slug.ts` does not exist.

- [ ] **Step 1.3: Implement `app/data/slug.ts`**

Create `app/data/slug.ts`:

```ts
import { randomBytes } from 'node:crypto'

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const SUFFIX_LENGTH = 6
const SLUG_PART_MAX = 40

/**
 * Reduce a sticker name to a URL-safe slug fragment.
 *
 * - Lowercases.
 * - Replaces any run of non-`[a-z0-9]` chars with a single hyphen.
 * - Trims leading/trailing hyphens.
 * - Hard-caps at 40 chars (trimming any trailing hyphen left by the cut).
 *
 * Returns an empty string if the name slugifies to nothing (emoji-only
 * names, whitespace-only names, etc.). Callers should append a suffix.
 */
export function slugifyName(name: string): string {
  const lowered = name.toLowerCase()
  const replaced = lowered.replace(/[^a-z0-9]+/g, '-')
  const trimmed = replaced.replace(/^-+|-+$/g, '')
  if (trimmed.length <= SLUG_PART_MAX) return trimmed
  return trimmed.slice(0, SLUG_PART_MAX).replace(/-+$/g, '')
}

/**
 * Build a full sticker slug: `<slug-part>-<6 lowercase alphanumerics>`.
 * If `slugifyName(name)` is empty, returns just the 6-char suffix.
 */
export function generateStickerSlug(name: string): string {
  const slugPart = slugifyName(name)
  const suffix = randomSuffix()
  return slugPart === '' ? suffix : `${slugPart}-${suffix}`
}

function randomSuffix(): string {
  // randomBytes(SUFFIX_LENGTH) gives us SUFFIX_LENGTH bytes of entropy;
  // we use each byte mod 36 to pick from the alphabet. The tiny bias
  // (256 % 36 = 4 extra picks for the first 4 chars) does not matter
  // for our use case.
  const bytes = randomBytes(SUFFIX_LENGTH)
  let out = ''
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    out += SUFFIX_ALPHABET[bytes[i]! % SUFFIX_ALPHABET.length]
  }
  return out
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern='slugify|generateStickerSlug'`

Expected: PASS, all 8 assertions.

- [ ] **Step 1.5: Run typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 1.6: Commit**

```bash
git add app/data/slug.ts app/data/slug.test.ts
git commit -m "add slug helpers + tests"
```

---

## Task 2: Schema, migration, migration test

**Files:**
- Modify: `app/data/schema.ts`
- Create: `migrations/20260603000000_add_sticker_slug/up.sql`
- Create: `migrations/20260603000000_add_sticker_slug/down.sql`
- Create: `test/migrations.test.ts`

- [ ] **Step 2.1: Add `slug` column to the table definition**

Edit `app/data/schema.ts`. Find the `stickers` table (around lines 18-28) and add `slug`:

```ts
export const stickers = table({
  name: 'stickers',
  columns: {
    id: c.text().primaryKey(),
    name: c.text().notNull(),
    slug: c.text().notNull().unique(),
    image_url: c.text().notNull(),
    owner_id: c.text(),
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})
```

- [ ] **Step 2.2: Create migration up SQL**

Create `migrations/20260603000000_add_sticker_slug/up.sql`:

```sql
ALTER TABLE stickers ADD COLUMN slug TEXT NOT NULL DEFAULT '';

-- Backfill: lowercase the name, replace common separators with hyphens,
-- trim edge hyphens, append a random 6-char hex suffix.
-- This is the "good enough" SQL version of slugifyName -- it handles
-- common cases (spaces, basic punctuation) but does not strip every
-- non-alphanumeric the way the TS function does. Acceptable: this only
-- runs once against existing rows; new stickers go through the TS helper.
UPDATE stickers
SET slug = trim(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    lower(name),
    ' ', '-'), '_', '-'), '.', '-'), ',', '-'), '!', '-'),
    '?', '-'), ':', '-'), ';', '-'), '/', '-'), '\', '-'),
  '-'
) || '-' || lower(hex(randomblob(3)))
WHERE slug = '';

-- Strip rows that ended up with a leading '-' (name was all separators
-- on the left). The suffix still keeps them unique.
UPDATE stickers SET slug = substr(slug, 2) WHERE slug LIKE '-%';

CREATE UNIQUE INDEX stickers_slug_unique ON stickers(slug);
```

- [ ] **Step 2.3: Create migration down SQL**

Create `migrations/20260603000000_add_sticker_slug/down.sql`:

```sql
DROP INDEX stickers_slug_unique;
ALTER TABLE stickers DROP COLUMN slug;
```

- [ ] **Step 2.4: Write the failing migration test**

Create `test/migrations.test.ts`:

```ts
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
```

- [ ] **Step 2.5: Run the migration test to verify it fails**

Run: `npm test -- --test-name-pattern='add_sticker_slug migration'`

Expected: FAIL — the migration directory does not exist yet, or the assertion against the backfill pattern fails. (If the previous steps were done in order, the migration files exist; the test should pass. If the test fails because of a path/ordering issue, debug here before continuing.)

- [ ] **Step 2.6: Run all tests to confirm migration test passes and nothing else regressed**

Run: `npm test`

Expected: existing 36 tests still pass, plus the new migration test and the slug helper tests. **Note:** some smoke tests will start failing here because the schema now requires a non-empty `slug` for new inserts. This is expected and fixed in Task 3+. Read the failures and confirm they are all sticker-insert related, not regressions from the migration logic itself.

- [ ] **Step 2.7: Run typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 2.8: Commit**

```bash
git add app/data/schema.ts migrations/20260603000000_add_sticker_slug/ test/migrations.test.ts
git commit -m "add sticker.slug column + backfill migration + test"
```

---

## Task 3: Route contract change

**Files:**
- Modify: `app/routes.ts`

- [ ] **Step 3.1: Change param from `:id` to `:slug` for sticker routes**

Edit `app/routes.ts`. Find lines 16-18 (the sticker routes):

```ts
  // Sticker show page
  sticker: '/sticker/:id',
  editSticker: form('/sticker/:id/edit'),
```

Change to:

```ts
  // Sticker show page (slug, not UUID)
  sticker: '/sticker/:slug',
  editSticker: form('/sticker/:slug/edit'),
```

- [ ] **Step 3.2: Run typecheck to see every call site that needs to change**

Run: `npm run typecheck`

Expected: FAIL with errors like `Property 'id' is missing in type '{ slug: ... }'` or `Property 'slug' is missing in type '{ id: ... }'` at every site that calls `routes.sticker.href({ id: ... })` or reads `context.params.id` inside the sticker controllers.

The next tasks fix these sites one by one.

- [ ] **Step 3.3: Commit (just the routes change — broken state is intentional, fixed in subsequent tasks)**

Actually, **do NOT commit yet.** This task leaves the tree in a state where typecheck fails. Commit at the end of Task 4 along with all the call-site updates, so the tree compiles between commits.

---

## Task 4: Controller and view call-site updates

**Files:**
- Modify: `app/actions/controller.tsx`
- Modify: `app/actions/edit-sticker/controller.tsx`
- Modify: `app/actions/upload-sticker/controller.tsx`
- Modify: `app/ui/sticker-card.tsx`
- Modify: `app/actions/admin/admin-stickers-page.tsx`
- Modify: `app/actions/sticker-page.tsx`
- Modify: `app/actions/edit-sticker-page.tsx`

The `sticker-page.tsx` and `sticker-card.tsx` etc. all receive sticker objects from controllers. We need to thread the `slug` through everywhere the `id` was used to build URLs. The simplest approach: keep `id` for internal references (admin delete, remove-sticker form action) and add `slug` for the show/edit URLs.

- [ ] **Step 4.1: Update root controller sticker show**

Edit `app/actions/controller.tsx`. Find the `sticker` action (around line 148):

Replace:

```ts
    // -------- Sticker show --------
    async sticker(context) {
      const db = context.get(Database)
      const sticker = await db.findOne(stickers, { where: { id: context.params.id } })
      if (!sticker) return notFound()
```

With:

```ts
    // -------- Sticker show --------
    async sticker(context) {
      const db = context.get(Database)
      const param = context.params.slug

      // Backwards compatibility: old UUID URLs 301-redirect to the slug URL.
      if (UUID_REGEX.test(param)) {
        const byId = await db.findOne(stickers, { where: { id: param } })
        if (!byId) return notFound()
        return redirect(routes.sticker.href({ slug: byId.slug }), 301)
      }

      const sticker = await db.findOne(stickers, { where: { slug: param } })
      if (!sticker) return notFound()
```

You'll also need a `UUID_REGEX` constant. Add it near the top of the file (after the imports):

```ts
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```

If `redirect` is not already imported in this file, import it from `remix/response/redirect`.

Verify by reading the file: the `sticker` action should now look up by slug, redirect UUIDs, and the surrounding code (passing `sticker` to `<StickerPage />`) is unchanged.

- [ ] **Step 4.2: Update edit-sticker controller (GET + POST)**

Edit `app/actions/edit-sticker/controller.tsx`. In the `index` action (around line 53):

Replace:

```ts
      const sticker = await db.findOne(stickers, { where: { id: context.params.id } })
      if (!sticker) return notFound()
```

With:

```ts
      const param = context.params.slug
      if (UUID_REGEX.test(param)) {
        const byId = await db.findOne(stickers, { where: { id: param } })
        if (!byId) return notFound()
        return redirect(routes.editSticker.index.href({ slug: byId.slug }), 301)
      }
      const sticker = await db.findOne(stickers, { where: { slug: param } })
      if (!sticker) return notFound()
```

In the `action` action (around line 77), the POST handler:

Replace:

```ts
      const sticker = await db.findOne(stickers, { where: { id: context.params.id } })
      if (!sticker) return notFound()
```

With:

```ts
      // POST: look up by slug only. A POST to /sticker/<uuid>/edit is a
      // stale form submission — return 404 so the user re-navigates.
      const sticker = await db.findOne(stickers, { where: { slug: context.params.slug } })
      if (!sticker) return notFound()
```

Add the UUID_REGEX constant near the top of the file (after imports):

```ts
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```

Find the final redirect line (around line 159):

Replace:

```ts
      return redirect(routes.sticker.href({ id: sticker.id }), 303)
```

With:

```ts
      return redirect(routes.sticker.href({ slug: sticker.slug }), 303)
```

- [ ] **Step 4.3: Update upload-sticker controller**

Edit `app/actions/upload-sticker/controller.tsx`.

Import the slug helper. Add to the imports at the top:

```ts
import { generateStickerSlug } from '../../data/slug.ts'
```

In the `action` function, find the block that creates a sticker (around line 77-86):

Replace:

```ts
      const db = context.get(Database)
      const now = Date.now()
      const id = randomUUID()
      await db.create(stickers, {
        id,
        name,
        image_url: storedImageUrl,
        owner_id: user.id,
        created_at: now,
        updated_at: now,
      })

      return redirect(routes.sticker.href({ id }), 303)
```

With:

```ts
      const db = context.get(Database)
      const now = Date.now()
      const id = randomUUID()
      const slug = generateStickerSlug(name)
      await db.create(stickers, {
        id,
        name,
        slug,
        image_url: storedImageUrl,
        owner_id: user.id,
        created_at: now,
        updated_at: now,
      })

      return redirect(routes.sticker.href({ slug }), 303)
```

- [ ] **Step 4.4: Update `sticker-card.tsx`**

Edit `app/ui/sticker-card.tsx`. The card takes a sticker prop and links by id. Find around line 25:

```ts
      <a href={routes.sticker.href({ id: sticker.id })} mix={cardStyle}>
```

Change to:

```ts
      <a href={routes.sticker.href({ slug: sticker.slug })} mix={cardStyle}>
```

The TypeScript type for the sticker prop is defined in this file (or imported). Open the file fully to find the prop type. If the type is `{ id: string; name: string; image_url: string }`, change it to include `slug: string`. If `id` is only used for the URL, you can drop it from the prop shape entirely — but it's safer to keep both since other components may pass id-bearing objects. **Keep `id` in the prop shape, add `slug`.**

- [ ] **Step 4.5: Update `admin-stickers-page.tsx`**

Edit `app/actions/admin/admin-stickers-page.tsx`. Find both occurrences (lines 63 and 68):

```ts
                  <a href={routes.sticker.href({ id: s.id })}>
                  ...
                  <a href={routes.sticker.href({ id: s.id })} mix={css({ '&:hover': { textDecoration: 'underline' } })}>
```

Change both to:

```ts
                  <a href={routes.sticker.href({ slug: s.slug })}>
                  ...
                  <a href={routes.sticker.href({ slug: s.slug })} mix={css({ '&:hover': { textDecoration: 'underline' } })}>
```

The page receives `s` (a sticker row) from the admin controller, which queries the `stickers` table. Since the table now has `slug`, `s.slug` is available. Check the page's prop type — add `slug: string` to the row shape if needed.

- [ ] **Step 4.6: Update `sticker-page.tsx`**

Edit `app/actions/sticker-page.tsx`. Find around line 32:

```ts
          url: routes.sticker.href({ id: sticker.id }),
```

Change to:

```ts
          url: routes.sticker.href({ slug: sticker.slug }),
```

Update the sticker prop type in this file to include `slug: string`. Also: the root controller passes `sticker: { id, name, image_url, owner }` into this page (look at controller.tsx lines 159-166). Update that to pass `slug` as well:

In `app/actions/controller.tsx` `sticker` action (around line 160):

```ts
          sticker={{
            id: sticker.id,
            slug: sticker.slug,
            name: sticker.name,
            image_url: sticker.image_url,
            owner,
          }}
```

- [ ] **Step 4.7: Update `edit-sticker-page.tsx`**

Edit `app/actions/edit-sticker-page.tsx`. Find around line 51:

```ts
            <a href={routes.sticker.href({ id: sticker.id })} mix={cancelLinkStyle}>
```

Change to:

```ts
            <a href={routes.sticker.href({ slug: sticker.slug })} mix={cancelLinkStyle}>
```

Update the `sticker` prop type to include `slug: string`. Then update the edit-sticker controller's render call (in `app/actions/edit-sticker/controller.tsx`, around line 64-66) to pass `slug`:

```ts
        <EditStickerPage
          user={user}
          sticker={{ id: sticker.id, slug: sticker.slug, name: sticker.name, image_url: sticker.image_url }}
          flash={flash}
        />,
```

Do the same for any other `EditStickerPage` renderings inside the controller's error branches (lines ~96-100, ~115-119, ~140-141).

- [ ] **Step 4.8: Update profile page sticker cards if they pass sticker data**

Check `app/actions/profile-page.tsx` or wherever stickers are passed to `<StickerCard />`. The profile controller (in `app/actions/controller.tsx` around line 187) maps stickers like `s => ({ id: s.id, name: s.name, ... })`. Update that mapping to include `slug: s.slug`. Apply the same change anywhere `stickers.map` returns objects fed into `<StickerCard />`.

Specifically check:
- `app/actions/controller.tsx` `profile` action (line ~187)
- Home page (`app/actions/home-page.tsx` and its controller call sites)
- Stickers index (`app/actions/stickers-page.tsx` and its controller call site)

For each: add `slug: s.slug` to the mapped object, and update the receiving page's prop type to include it.

- [ ] **Step 4.9: Update seed script**

Edit `scripts/seed.ts`. The seed creates a sample sticker. Find the sticker insert and add a slug field. Use `generateStickerSlug` from `app/data/slug.ts`:

Add the import:

```ts
import { generateStickerSlug } from '../app/data/slug.ts'
```

Find the `db.create(stickers, { ... })` call and add:

```ts
slug: generateStickerSlug(name),
```

(where `name` is whatever the sample sticker's name variable is — check the file).

- [ ] **Step 4.10: Run typecheck**

Run: `npm run typecheck`

Expected: clean. If errors remain, fix them — each error points to a call site that still uses `id` where it now needs `slug`, or a prop type that doesn't include `slug`. Read the error, fix the site, re-run.

- [ ] **Step 4.11: Commit the routes change + all call-site updates together**

```bash
git add app/routes.ts app/actions/ app/ui/sticker-card.tsx scripts/seed.ts
git commit -m "switch sticker URLs from UUID to slug"
```

---

## Task 5: Update smoke tests

**Files:**
- Modify: `test/smoke.test.ts`

The two existing tests that reference `routes.sticker.href({ id: stickerId })` need to use the slug. Since the test creates stickers via `env.db.create(stickers, {...})` directly, the test must now also supply a `slug` field.

- [ ] **Step 5.1: Generate slugs in existing test fixtures**

Edit `test/smoke.test.ts`. Find all `env.db.create(stickers, { ... })` calls. For each, add a `slug` field using `generateStickerSlug` from `app/data/slug.ts`.

Add the import at the top of the test file:

```ts
import { generateStickerSlug } from '../app/data/slug.ts'
```

Then for each `env.db.create(stickers, { ... })` call (lines 258-260, 403-411, 442-446, 561-563, 735-737, 770-772, and any others ripgrep finds), add `slug: generateStickerSlug(<name>)` to the object literal.

Example (line ~404):

```ts
      const stickerId = randomUUID()
      await env.db.create(stickers, {
        id: stickerId,
        name: 'old name',
        slug: generateStickerSlug('old name'),
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })
```

- [ ] **Step 5.2: Update existing `routes.sticker.href` and `routes.editSticker.*.href` calls in tests**

Find every test call that references `routes.sticker.href({ id: stickerId })` or `routes.editSticker.{index,action}.href({ id: stickerId })`. To use the new slug URL, the test needs the slug. The cleanest pattern: store the slug in a local variable when constructing the fixture, then use it in URLs.

For each test that creates a sticker and then makes URL references, refactor like so:

```ts
      const stickerId = randomUUID()
      const stickerName = 'old name'
      const stickerSlug = generateStickerSlug(stickerName)
      await env.db.create(stickers, {
        id: stickerId,
        name: stickerName,
        slug: stickerSlug,
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      // ... later, where the test was using id:
      const res = await postForm(env, routes.editSticker.action.href({ slug: stickerSlug }), { ... })
      assert.equal(res.headers.get('location'), routes.sticker.href({ slug: stickerSlug }))
```

Apply this pattern at each test site identified in Step 5.1. **Do not** change the `routes.admin.deleteSticker.href({ id: ... })` call (line ~272) or any `routes.api.*` calls — those still use UUID by design.

- [ ] **Step 5.3: Add the UUID → slug redirect test**

In `test/smoke.test.ts`, find the `describe('edit sticker', ...)` block or any other sticker-related `describe`. Add a new top-level `describe('sticker URL backwards compatibility', () => { ... })` block. Inside:

```ts
describe('sticker URL backwards compatibility', () => {
  it('301-redirects /sticker/<uuid> to the slug URL', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'redirector', 'redirectorpass')
      const stickerId = randomUUID()
      const stickerName = 'Vintage'
      const stickerSlug = generateStickerSlug(stickerName)
      await env.db.create(stickers, {
        id: stickerId,
        name: stickerName,
        slug: stickerSlug,
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(
        new Request(buildUrl(`/sticker/${stickerId}`), { redirect: 'manual' }),
      )
      assert.equal(res.status, 301)
      assert.equal(res.headers.get('location'), `/sticker/${stickerSlug}`)
    } finally {
      env.cleanup()
    }
  })

  it('returns 404 for a /sticker/<uuid> with no matching sticker', async () => {
    const env = await createTestEnv()
    try {
      const phantomId = randomUUID()
      const res = await env.fetch(new Request(buildUrl(`/sticker/${phantomId}`)))
      assert.equal(res.status, 404)
    } finally {
      env.cleanup()
    }
  })
})
```

- [ ] **Step 5.4: Run all tests**

Run: `npm test`

Expected: all tests pass (existing 36 + new migration test + new redirect tests + slug helper tests).

If any sticker-related test fails because of a missing `slug` field, you missed a `db.create(stickers, ...)` call in Step 5.1 — search for it and fix.

- [ ] **Step 5.5: Run typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 5.6: Commit**

```bash
git add test/smoke.test.ts
git commit -m "tests: use slug URLs + add UUID-redirect coverage"
```

---

## Task 6: Browser verification

**Files:** none modified; manual verification.

- [ ] **Step 6.1: Start dev server**

Run (in a separate terminal or background):

```bash
SESSION_SECRET=dev-secret npm run dev
```

Wait for "listening on http://localhost:3000" or equivalent.

- [ ] **Step 6.2: Verify new uploads get slug URLs**

1. Visit http://localhost:3000/login
2. Log in as `alice` / `alicepass` (from seed)
3. Visit /upload-sticker
4. Upload a sticker named "Test Slug"
5. After redirect, verify the URL is `/sticker/test-slug-<6chars>` (where the 6 chars match `[a-z0-9]`)

- [ ] **Step 6.3: Verify UUID URL redirects**

1. Find an existing sticker's UUID (look in the seed data or copy from an admin page). Or, take note of the new sticker's UUID by querying via the API: `curl http://localhost:3000/api/stickers/<slug>` won't help (that's slug); instead, log in as admin and visit `/admin/stickers` — the IDs aren't visible there. Easier: query the DB directly via `sqlite3 db/stickertrade.sqlite "SELECT id, slug FROM stickers LIMIT 1"`.
2. Visit `http://localhost:3000/sticker/<the-uuid>` in the browser. The URL bar should change to `/sticker/<the-slug>` after the redirect.
3. Confirm the network panel shows a 301.

- [ ] **Step 6.4: Verify rename does NOT change the URL**

1. Visit `/sticker/<some-slug>` and click "edit" (only visible to the owner).
2. Rename the sticker.
3. After redirect, the URL is still the original slug (not regenerated from the new name). This confirms frozen-slug behaviour.

- [ ] **Step 6.5: Verify emoji-only name produces suffix-only URL**

1. Upload a sticker named just `🦖`.
2. Verify the URL is `/sticker/<6chars>` (no slug-part, just suffix).

- [ ] **Step 6.6: Stop dev server**

If running in background:

```bash
# find and kill it
```

(Or just Ctrl-C in the foreground terminal.)

---

## Task 7: Roadmap update

**Files:**
- Modify: `app/data/roadmap.ts`

- [ ] **Step 7.1: Add roadmap entry**

Edit `app/data/roadmap.ts`. Find the "Recently shipped" section (the early items in `sourceTasks`). Add a new entry, in the same style as the existing ones:

```ts
  {
    title: 'Slug URLs for stickers 🐌',
    description: md(`
- [x] Public sticker URLs are now \`/sticker/<name>-<6chars>\` instead of full UUIDs
- [x] Old UUID URLs 301-redirect to the new slug URL
- [x] JSON API and admin actions keep UUID params (intentional)
`),
  },
```

Place it after the "JSON API 🔌" entry and before the "Opengraph images 🖼️" entry.

- [ ] **Step 7.2: Run typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 7.3: Run tests**

Run: `npm test`

Expected: all pass.

- [ ] **Step 7.4: Commit**

```bash
git add app/data/roadmap.ts
git commit -m "roadmap: mark sticker slugs shipped"
```

---

## Task 8: Open PR

- [ ] **Step 8.1: Push the branch**

```bash
git push -u origin sticker-slugs
```

- [ ] **Step 8.2: Open the PR**

Use `gh` to open the PR against `main`:

```bash
gh pr create \
  --base main \
  --head sticker-slugs \
  --title "sticker URLs: switch from UUID to slug" \
  --body "$(cat <<'EOF'
Replace UUID-based sticker URLs with name-derived slugs.

`/sticker/5a2077e8-ef49-446b-aa27-dca99e15a9b4` → `/sticker/dino-sticker-k3p9aq`

## What changed

- New `slug` column on the `stickers` table, backfilled in a single SQL migration.
- `app/data/slug.ts` provides `slugifyName` and `generateStickerSlug`. Pure functions, fully unit-tested.
- Route contract: `/sticker/:id` → `/sticker/:slug`, same for the edit page.
- Old UUID URLs 301-redirect to the slug URL.
- Slug is frozen at sticker creation. Renaming does not regenerate.

## What did NOT change

- JSON API still uses UUID (`/api/stickers/:id`).
- All form action / POST targets still use UUID (admin delete, remove-sticker, etc.).
- Invitations still use UUID (security-sensitive).

## Verification

- 36 existing tests still pass.
- New tests: slug helper unit tests, migration backfill test, UUID-redirect smoke tests.
- Manual browser verification: new uploads get slug URLs; UUID URLs redirect; rename does not change slug; emoji names get suffix-only URLs.

Spec: `docs/superpowers/specs/2026-06-03-sticker-slugs-design.md`
Plan: `docs/superpowers/plans/2026-06-03-sticker-slugs.md`
EOF
)"
```

- [ ] **Step 8.3: Report the PR URL to the user**

Print the PR URL (the `gh pr create` command outputs it on success). Note that the user prefers to review before merging — do not merge.

---

## Notes for the executing agent

- The migration test in Task 2 will run BEFORE the smoke tests in Task 5 are fixed. Expect some smoke tests to fail after Task 2 commits because they try to insert stickers without a `slug` field. Task 5 fixes them. Do not panic during the intermediate broken state — that's expected. Run the migration test in isolation if needed: `npm test -- --test-name-pattern='add_sticker_slug migration'`.

- The Remix 3 controller pattern: every handler returns a `Response` explicitly. `notFound()` is a helper defined locally in some controllers (look for it). If it's not in scope at a particular site, use `new Response('Not Found', { status: 404 })`.

- The repository convention for migrations is **SQL only** (`up.sql`/`down.sql` files in a timestamped directory). Do not use the `createMigration` TS API mentioned in some Remix docs — it is not wired into our `scripts/migrate.ts`.

- `routes.sticker.href({ slug })` and `routes.editSticker.index.href({ slug })` are the typed builders. Always use them rather than constructing URL strings by hand. The typechecker will catch missing or wrong-named params.

- If `npm test` hangs or warns about open handles, check whether a test forgot to call `env.cleanup()` in a `finally` block. Every test in this codebase uses `try { ... } finally { env.cleanup() }`.

- The `gh pr create` command in Task 8 may fail if the user has a different default remote or branch protection. If it does, fall back to printing the suggested PR title and body and ask the user to create the PR manually.
