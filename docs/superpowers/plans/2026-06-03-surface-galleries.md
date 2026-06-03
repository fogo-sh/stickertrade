# Surface Galleries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the surfaces feature so each surface holds multiple images with one designated as the primary. Lands in the existing `sticker-surfaces` PR (#25) **before merge**, so we get the schema right in a single release.

**Architecture:** New `surface_images` table; drop `image_url` from `surfaces`. Migration backfills each existing surface's single image as the primary. Multi-image upload on create. Per-image POST endpoints for gallery management. JSON API gains `images` array and three management endpoints. `SurfaceCard` keeps its `image_url` prop; controllers pre-compute the primary URL.

**Tech Stack:** Remix 3, `remix/data-table` (SQLite + `db.transaction`), `sharp` for image processing, `node:crypto` for UUIDs, `node:test` for tests.

**Spec:** `docs/superpowers/specs/2026-06-03-surface-galleries-design.md`

**Working branch:** `sticker-surfaces` (already checked out)

---

## File Structure

**Create:**
- `migrations/20260603200000_surface_galleries/up.sql` + `down.sql`
- `app/actions/add-surface-image/controller.tsx`
- `app/actions/remove-surface-image/controller.tsx`
- `app/actions/set-primary-surface-image/controller.tsx`

**Modify:**
- `app/data/schema.ts` — add `surfaceImages`, drop `image_url` from `surfaces`
- `app/utils/upload.ts` — add `options?: { maxFiles?; maxTotalSize? }` to `readUploadFormData` / `readVerifiedUploadFormData`
- `app/routes.ts` — add 3 form routes + 3 API routes
- `app/router.ts` — wire 3 new form controllers
- `app/actions/upload-surface/controller.tsx` — accept up to 8 images
- `app/actions/upload-surface-page.tsx` — `multiple` file input
- `app/actions/edit-surface/controller.tsx` — drop image handling; pass gallery to page
- `app/actions/edit-surface-page.tsx` — render gallery section + per-image forms
- `app/actions/surface-page.tsx` — render primary + gallery stack
- `app/actions/remove-surface/controller.tsx` — clean up ALL image files (not just one)
- `app/actions/controller.tsx` — `home`/`profile`/`surfaces` index/`surface` show: hydrate primary `image_url`
- `app/actions/admin/controller.tsx` — admin surfaces index: hydrate primary `image_url`
- `app/actions/api/controller.tsx` — multi-image create, hydrate `images` arrays, surface delete iterates files; add 3 new gallery endpoints
- `app/actions/api/serializers.ts` — `JsonSurface.images`, drop top-level `image_url`
- `app/data/roadmap.ts` — update surfaces entry (or add a galleries note)
- `test/helpers.ts` — add `seedSurface(env, opts)` helper + wire 3 new controllers
- `test/migrations.test.ts` — backfill + partial unique index assertions
- `test/smoke.test.ts` — update existing surface fixtures to use `seedSurface`; add ~12 new tests
- `scripts/seed.ts` — `seedSurface`-style creation for any sample surfaces

**Do NOT modify:**
- `SurfaceCard` (`app/ui/surface-card.tsx`) — interface stays single-image
- `SurfaceCardSurface` type — keeps `image_url: string`
- Sticker controllers, auth, sessions
- The `surface-of-the-day` algorithm itself (still returns a `Surface`; home controller computes primary URL separately)

---

## Notes for the executing agent

- **Pre-merge means we don't have prod data to migrate.** Dev DBs have at most a few surfaces. The backfill is safe.
- **`db.transaction(async (tx) => {...})` is the transaction API** — `tx` is a `Database`-shaped object you call `tx.create/update/delete/findOne/findMany` on. Use this for set-primary (must unset old + set new atomically) and create-surface-with-images (must insert all rows atomically).
- **Partial unique index for at-most-one primary** is enforced by SQLite: `CREATE UNIQUE INDEX ... ON surface_images(surface_id) WHERE is_primary = 1`. The set-primary transaction must demote first, then promote — order matters.
- **`SurfaceCard.image_url` prop stays string-typed.** Controllers compute the primary URL before calling render. Missing primary → fall back to `/images/banner.png`.
- **`is_primary` round-trip:** SQLite stores BOOLEAN as 0/1. `remix/data-table` `c.boolean()` reads back as boolean in TS. Cast with `Boolean(row.is_primary)` if it ever shows up as 0/1 (it shouldn't with the typed column).
- **Test fixture migration:** every `db.create(surfaces, {...})` in existing tests needs to also create a primary image. Use the new `seedSurface(env, ...)` helper.
- **The `inList(...)` composition with extra `where` keys** may or may not work depending on `remix/data-table`. If `where: { ...inList('col', ids), is_primary: true }` fails, fall back to fetching all by-surface_id then filtering in JS. Task 8 handles this.
- **8-file upload limit needs an upload-limits override.** The current `parseFormData(request, UPLOAD_LIMITS)` hardcodes the constants. Task 2 extends the helpers to accept overrides.

---


## Task 1: Schema + migration + migration tests

**Files:**
- Modify: `app/data/schema.ts`
- Create: `migrations/20260603200000_surface_galleries/up.sql`
- Create: `migrations/20260603200000_surface_galleries/down.sql`
- Modify: `test/migrations.test.ts`

- [ ] **Step 1.1: Add `surfaceImages` table + drop `image_url` from `surfaces` in `app/data/schema.ts`**

Find the existing `surfaces` table definition. Remove the `image_url` column:

```ts
export const surfaces = table({
  name: 'surfaces',
  columns: {
    id: c.text().primaryKey(),
    name: c.text().notNull(),
    slug: c.text().notNull().unique(),
    description: c.text(),
    owner_id: c.text().notNull(),
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})
```

Add a new table next to `surfaces` and `surfaceFeatures`:

```ts
export const surfaceImages = table({
  name: 'surface_images',
  columns: {
    id: c.text().primaryKey(),
    surface_id: c.text().notNull(),
    image_url: c.text().notNull(),
    is_primary: c.boolean().notNull(),
    created_at: c.integer().notNull(),
  },
})
```

Add the type export with the other `TableRow` exports at the bottom of the file:

```ts
export type SurfaceImage = TableRow<typeof surfaceImages>
```

- [ ] **Step 1.2: Create `migrations/20260603200000_surface_galleries/up.sql`**

```sql
CREATE TABLE surface_images (
  id TEXT PRIMARY KEY,
  surface_id TEXT NOT NULL REFERENCES surfaces(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_primary INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX surface_images_surface_id_idx ON surface_images(surface_id);

-- Partial unique index: at most one primary per surface.
CREATE UNIQUE INDEX surface_images_one_primary_per_surface
  ON surface_images(surface_id)
  WHERE is_primary = 1;

-- Backfill: every existing surface's single image becomes its primary.
-- id is a UUID-shaped string matching what randomUUID() produces at runtime
-- (8-4-4-4-12 lowercase hex with the v4 marker).
INSERT INTO surface_images (id, surface_id, image_url, is_primary, created_at)
  SELECT
    lower(
      substr(hex(randomblob(4)), 1, 8) || '-' ||
      substr(hex(randomblob(2)), 1, 4) || '-' ||
      '4' || substr(hex(randomblob(2)), 2, 3) || '-' ||
      substr('89ab', 1 + abs(random() % 4), 1) || substr(hex(randomblob(2)), 2, 3) || '-' ||
      substr(hex(randomblob(6)), 1, 12)
    ),
    id, image_url, 1, created_at
  FROM surfaces;

ALTER TABLE surfaces DROP COLUMN image_url;
```

- [ ] **Step 1.3: Create `migrations/20260603200000_surface_galleries/down.sql`**

```sql
-- Restore image_url from each surface's primary image.
ALTER TABLE surfaces ADD COLUMN image_url TEXT;
UPDATE surfaces
SET image_url = (
  SELECT image_url FROM surface_images
  WHERE surface_id = surfaces.id AND is_primary = 1
  LIMIT 1
);

DROP INDEX surface_images_one_primary_per_surface;
DROP INDEX surface_images_surface_id_idx;
DROP TABLE surface_images;
```

- [ ] **Step 1.4: Add migration test to `test/migrations.test.ts`**

Append a new `describe` block at the bottom:

```ts
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
```

- [ ] **Step 1.5: Run typecheck**

```bash
npm run typecheck
```

Expected: NUMEROUS errors. Every controller / page / test that reads `surface.image_url` will fail. This is expected — Task 1 only changes the schema. Subsequent tasks fix the readers.

Confirm the errors are all about `image_url` on a `Surface` or `SurfaceCardSurface`. If there are any errors NOT about that, debug before continuing.

- [ ] **Step 1.6: Run the migration test in isolation**

```bash
npm test -- --test-name-pattern='surface_galleries migration'
```

Expected: PASS. (Even though typecheck fails project-wide, the migration test itself doesn't import from any of the broken modules.)

If the test runner's pattern filter doesn't work (it sometimes doesn't), run the full suite and grep for the new test:

```bash
npm test 2>&1 | grep -A1 'surface_galleries'
```

- [ ] **Step 1.7: Commit (intentionally broken intermediate state)**

```bash
git add app/data/schema.ts migrations/20260603200000_surface_galleries/ test/migrations.test.ts
git commit -m "schema: add surface_images table, drop surfaces.image_url"
```

This commit leaves `npm run typecheck` failing. Subsequent tasks fix the callers.

---

## Task 2: Upload-limits override

**Files:**
- Modify: `app/utils/upload.ts`

Tiny additive change. Adds an `options?` parameter so the surface upload route can accept more / larger files than the sticker default.

- [ ] **Step 2.1: Extend `readUploadFormData`**

Edit `app/utils/upload.ts`. Find:

```ts
export async function readUploadFormData(request: Request): Promise<UploadResult> {
  try {
    const value = await parseFormData(request, UPLOAD_LIMITS)
    return { success: true, value }
  } catch (error) {
    const uploadError = toUploadError(error)
    if (uploadError) return { success: false, error: uploadError }
    throw error
  }
}
```

Change to:

```ts
export interface UploadOverrides {
  maxFiles?: number
  maxTotalSize?: number
  maxFileSize?: number
}

export async function readUploadFormData(
  request: Request,
  overrides: UploadOverrides = {},
): Promise<UploadResult> {
  const limits = { ...UPLOAD_LIMITS, ...overrides }
  try {
    const value = await parseFormData(request, limits)
    return { success: true, value }
  } catch (error) {
    const uploadError = toUploadError(error)
    if (uploadError) return { success: false, error: uploadError }
    throw error
  }
}
```

- [ ] **Step 2.2: Extend `readVerifiedUploadFormData`**

Find:

```ts
export async function readVerifiedUploadFormData(
  context: RequestContext<any, any>,
): Promise<VerifiedUploadResult> {
  const parsed = await readUploadFormData(context.request)
  ...
}
```

Change to:

```ts
export async function readVerifiedUploadFormData(
  context: RequestContext<any, any>,
  overrides: UploadOverrides = {},
): Promise<VerifiedUploadResult> {
  const parsed = await readUploadFormData(context.request, overrides)
  if (!parsed.success) {
    return { success: false, kind: 'upload', error: parsed.error }
  }
  const denied = assertCsrfToken(context, parsed.value.get('_csrf'))
  if (denied) {
    return { success: false, kind: 'csrf', response: denied }
  }
  return { success: true, value: parsed.value }
}
```

- [ ] **Step 2.3: Update `toUploadError` to use the limit that fired**

Find `toUploadError` near the top of the file. It currently hardcodes `UPLOAD_LIMITS.maxFileSize` and `UPLOAD_LIMITS.maxTotalSize` in the error messages. That's OK for now — the message is approximate; the error code is the load-bearing part. **Leave `toUploadError` unchanged.** The message will mention the default limit even when a route uses a higher one; acceptable for v1.

- [ ] **Step 2.4: Run typecheck**

```bash
npm run typecheck
```

Expected: same `image_url` errors from Task 1 (no new errors). The override parameter has a default `{}` so existing callers keep working.

- [ ] **Step 2.5: Run tests**

```bash
npm test -- --test-name-pattern='upload|migration'
```

Expected: at minimum the migration test still passes. Other tests will be in the broken intermediate state from Task 1; that's fine.

- [ ] **Step 2.6: Commit**

```bash
git add app/utils/upload.ts
git commit -m "upload: optional per-call limits override"
```

---

## Task 3: Multi-image upload-surface controller + page

**Files:**
- Modify: `app/actions/upload-surface/controller.tsx`
- Modify: `app/actions/upload-surface-page.tsx`

- [ ] **Step 3.1: Update `upload-surface-page.tsx` to accept multiple files**

Find the image input. Add `multiple` and update the helper text. The exact wording / surrounding markup depends on the existing page — match the codebase style:

```tsx
<FileField
  name="image"
  label="images"
  helperText="up to 8 images. the first will be the primary."
  accept="image/png,image/jpeg,image/webp"
  required
  multiple
  error={errors?.image}
/>
```

**Open `app/ui/form.tsx` first** to confirm `FileField` accepts a `multiple` prop. If it doesn't, either:
- Add `multiple?: boolean` to `FileField`'s props and spread to the underlying `<input>`, OR
- Inline a raw `<input type="file" multiple ...>` in the upload page like the original plan code did.

Match whatever's least invasive given the form-field abstraction in the codebase.

- [ ] **Step 3.2: Update `upload-surface/controller.tsx`**

The full new controller:

```tsx
import { randomUUID } from 'node:crypto'

import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces, surfaceImages } from '../../data/schema.ts'
import { generateContentSlug } from '../../data/slug.ts'
import {
  ProcessImageError,
  processSurfaceUpload,
} from '../../data/upload-image.ts'
import { uploadStorage } from '../../data/uploads.ts'
import {
  issuesToFieldErrors,
  surfaceDescriptionSchema,
  surfaceNameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { readVerifiedUploadFormData } from '../../utils/upload.ts'
import { UploadSurfacePage } from '../upload-surface-page.tsx'

const MAX_GALLERY_FILES = 8
const MAX_TOTAL_BYTES = 88 * 1024 * 1024 // 8 × 10 MiB + headroom

async function cleanupStoredUrls(urls: string[]): Promise<void> {
  for (const url of urls) {
    if (!url || !url.startsWith('/uploads/')) continue
    const key = url.slice('/uploads/'.length)
    try {
      await uploadStorage.remove(key)
    } catch {
      // ignore
    }
  }
}

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

      const verified = await readVerifiedUploadFormData(context, {
        maxFiles: MAX_GALLERY_FILES + 4, // account for non-file parts
        maxTotalSize: MAX_TOTAL_BYTES,
      })
      if (!verified.success) {
        if (verified.kind === 'csrf') return verified.response
        return context.render(
          <UploadSurfacePage user={user} errors={{ image: verified.error.message }} />,
          { status: verified.error.status },
        )
      }
      const formData = verified.value

      // Validate name + description via schemas.
      const nameAndDescSchema = f.object({
        name: f.field(surfaceNameSchema),
        description: f.field(s.optional(surfaceDescriptionSchema)),
      })
      const parsed = s.parseSafe(nameAndDescSchema, formData)
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
      const { name, description } = parsed.value

      // Pull all File parts named "image" with non-zero size.
      const allImageFields = formData.getAll('image')
      const files = allImageFields.filter(
        (v): v is File => v instanceof File && v.size > 0,
      )

      if (files.length === 0) {
        return context.render(
          <UploadSurfacePage
            user={user}
            errors={{ image: 'please choose at least one image' }}
            values={{ name, description: description ?? '' }}
          />,
          { status: 400 },
        )
      }
      if (files.length > MAX_GALLERY_FILES) {
        return context.render(
          <UploadSurfacePage
            user={user}
            errors={{ image: `at most ${MAX_GALLERY_FILES} images per surface` }}
            values={{ name, description: description ?? '' }}
          />,
          { status: 400 },
        )
      }

      // Process each file. On any failure, clean up stored URLs and re-render.
      const storedUrls: string[] = []
      for (const file of files) {
        try {
          const url = await processSurfaceUpload(file)
          storedUrls.push(url)
        } catch (error) {
          await cleanupStoredUrls(storedUrls)
          let message = 'upload failed'
          if (error instanceof ProcessImageError) message = error.message
          else if (error instanceof Error) message = error.message
          return context.render(
            <UploadSurfacePage
              user={user}
              errors={{ image: message }}
              values={{ name, description: description ?? '' }}
            />,
            { status: 400 },
          )
        }
      }

      // Insert surface + images atomically.
      const db = context.get(Database)
      const now = Date.now()
      const surfaceId = randomUUID()
      const slug = generateContentSlug(name)

      try {
        await db.transaction(async (tx) => {
          await tx.create(surfaces, {
            id: surfaceId,
            name,
            slug,
            ...(description == null ? {} : { description }),
            owner_id: user.id,
            created_at: now,
            updated_at: now,
          })
          for (let i = 0; i < storedUrls.length; i++) {
            await tx.create(surfaceImages, {
              id: randomUUID(),
              surface_id: surfaceId,
              image_url: storedUrls[i]!,
              is_primary: i === 0,
              created_at: now + i, // preserve upload order in created_at
            })
          }
        })
      } catch (error) {
        // Catastrophic: clean up storage so we don't leak files.
        await cleanupStoredUrls(storedUrls)
        throw error
      }

      return redirect(`/surface/${encodeURIComponent(slug)}`, 303)
    },
  },
})
```

- [ ] **Step 3.3: Run typecheck**

```bash
npm run typecheck
```

Expected: still `image_url` errors elsewhere; the upload controller itself should now typecheck cleanly. The errors should be in: surface-page, edit-surface, surface-card consumers, API, admin, root `controller.tsx` etc. — NOT in upload-surface.

- [ ] **Step 3.4: Commit**

```bash
git add app/actions/upload-surface/controller.tsx app/actions/upload-surface-page.tsx
git commit -m "upload-surface: accept up to 8 images, first is primary"
```

---

## Task 4: Test harness — seedSurface helper + fix existing fixtures

**Files:**
- Modify: `test/helpers.ts`
- Modify: `test/smoke.test.ts`
- Modify: `scripts/seed.ts`

Goal: get the existing test suite GREEN before adding new gallery tests. Every existing `db.create(surfaces, ...)` call needs a paired `db.create(surfaceImages, ...)` primary row.

- [ ] **Step 4.1: Add `seedSurface` to `test/helpers.ts`**

Add at the top of the file with the existing imports:

```ts
import { surfaces, surfaceImages, type Surface } from '../app/data/schema.ts'
import { generateContentSlug } from '../app/data/slug.ts'
```

(Some of these may already be imported — extend the existing import statement rather than duplicating.)

Add the helper at the bottom of the file alongside `seedUser`:

```ts
export interface SeedSurfaceOptions {
  ownerId: string
  name: string
  description?: string | null
  imageUrl?: string
}

/**
 * Create a surface with one primary image. Returns the surface id, slug,
 * and the primary image's id.
 *
 * Defaults: name is the only required field besides ownerId. imageUrl
 * defaults to /images/banner.png — fine for tests that don't care about
 * the file contents.
 */
export async function seedSurface(
  env: TestEnv,
  opts: SeedSurfaceOptions,
): Promise<{ id: string; slug: string; primaryImageId: string }> {
  const id = randomUUID()
  const primaryImageId = randomUUID()
  const slug = generateContentSlug(opts.name)
  const now = Date.now()
  await env.db.transaction(async (tx) => {
    await tx.create(surfaces, {
      id,
      name: opts.name,
      slug,
      ...(opts.description ? { description: opts.description } : {}),
      owner_id: opts.ownerId,
      created_at: now,
      updated_at: now,
    })
    await tx.create(surfaceImages, {
      id: primaryImageId,
      surface_id: id,
      image_url: opts.imageUrl ?? '/images/banner.png',
      is_primary: true,
      created_at: now,
    })
  })
  return { id, slug, primaryImageId }
}
```

If `randomUUID` isn't already imported at the top of `helpers.ts`, add `import { randomUUID } from 'node:crypto'`.

If `TestEnv` is the right type for `env`, great; otherwise look at the existing `seedUser(env, ...)` signature and match.

- [ ] **Step 4.2: Update every `db.create(surfaces, ...)` call in `test/smoke.test.ts`**

Find every existing `await env.db.create(surfaces, {...})` call:

```bash
rg "env\.db\.create\(surfaces" test/smoke.test.ts
```

For each call, replace with a `seedSurface(env, ...)` invocation. The pattern:

**Before:**
```ts
const id = randomUUID()
const slug = generateContentSlug('Some Name')
await env.db.create(surfaces, {
  id,
  name: 'Some Name',
  slug,
  image_url: '/images/banner.png',
  owner_id: ownerId,
  created_at: Date.now(),
  updated_at: Date.now(),
})
```

**After:**
```ts
const { id, slug } = await seedSurface(env, { ownerId, name: 'Some Name' })
```

If the test references the image url (e.g., the "show by slug" test checks the rendered HTML contains the description), preserve the `description` arg.

Add `import { seedSurface } from './helpers.ts'` at the top of `smoke.test.ts` (extend the existing helpers import).

There are ~12 fixture sites. Take them all in one pass.

**Special case:** any test that uses `surface.image_url` after creating the surface (e.g. directly reading the surface row and inspecting `.image_url`) needs to be adapted — read from `surface_images` instead. Most tests don't do this; they just create + fetch by URL.

- [ ] **Step 4.3: Update `scripts/seed.ts` if it creates a sample surface**

Check if the seed script creates any surfaces:

```bash
grep -n "surfaces" scripts/seed.ts
```

If it does, use the same pattern as `seedSurface`: create the surface row, then create one `surface_images` row with `is_primary: true`. Use a transaction. The seed script doesn't have access to the test `helpers.ts`, so inline the logic.

If the seed script doesn't reference surfaces, skip this step.

- [ ] **Step 4.4: Run typecheck**

```bash
npm run typecheck
```

Expected: same `image_url` errors in app code (controllers/pages that read `surface.image_url`). The tests should be clean now. If tests still have `image_url` errors, you missed a `db.create` call.

- [ ] **Step 4.5: Run tests**

```bash
npm test
```

Expected: the migration tests pass. Most smoke tests will still fail because the app code (controllers/pages) hasn't been updated yet to read from `surface_images`. **Count the failures.** Goal of this commit is: tests that pass are the ones whose corresponding app code doesn't yet need updating (mostly migration tests).

If a smoke test fails with a stack trace involving `surface.image_url is undefined` or similar — that's expected. We'll fix the app code in subsequent tasks.

- [ ] **Step 4.6: Commit**

```bash
git add test/helpers.ts test/smoke.test.ts scripts/seed.ts
git commit -m "tests: seedSurface helper + update fixtures for surface_images"
```

---

## Task 5: Routes + form action controllers (add/remove/set-primary)

**Files:**
- Modify: `app/routes.ts`
- Modify: `app/router.ts`
- Modify: `test/helpers.ts` (wire new controllers in test router)
- Create: `app/actions/add-surface-image/controller.tsx`
- Create: `app/actions/remove-surface-image/controller.tsx`
- Create: `app/actions/set-primary-surface-image/controller.tsx`

- [ ] **Step 5.1: Add routes to `app/routes.ts`**

Add next to the existing surface form routes:

```ts
  addSurfaceImage: form('/surface/:slug/images'),
  removeSurfaceImage: form('/surface/:slug/images/:imageId/remove'),
  setPrimarySurfaceImage: form('/surface/:slug/images/:imageId/primary'),
```

- [ ] **Step 5.2: Wire imports + mappings in `app/router.ts`**

Add imports (alphabetical):

```ts
import addSurfaceImageController from './actions/add-surface-image/controller.tsx'
import removeSurfaceImageController from './actions/remove-surface-image/controller.tsx'
import setPrimarySurfaceImageController from './actions/set-primary-surface-image/controller.tsx'
```

Add mappings:

```ts
router.map(routes.addSurfaceImage, addSurfaceImageController)
router.map(routes.removeSurfaceImage, removeSurfaceImageController)
router.map(routes.setPrimarySurfaceImage, setPrimarySurfaceImageController)
```

- [ ] **Step 5.3: Wire imports + mappings in `test/helpers.ts`**

Same additions in the test harness router so smoke tests can exercise these routes.

- [ ] **Step 5.4: Create `app/actions/add-surface-image/controller.tsx`**

```tsx
import { randomUUID } from 'node:crypto'

import * as s from 'remix/data-schema'
import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces, surfaceImages } from '../../data/schema.ts'
import {
  ProcessImageError,
  processSurfaceUpload,
} from '../../data/upload-image.ts'
import { routes } from '../../routes.ts'
import { readVerifiedUploadFormData } from '../../utils/upload.ts'

const MAX_GALLERY_FILES = 8

function notFound() {
  return new Response('Not Found', { status: 404 })
}

export default createController(routes.addSurfaceImage, {
  actions: {
    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, {
        where: { slug: context.params.slug },
      })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      // Check current count BEFORE accepting the upload.
      const currentCount = await db.count(surfaceImages, {
        where: { surface_id: surface.id },
      })
      if (currentCount >= MAX_GALLERY_FILES) {
        return new Response(
          `Surface already has ${MAX_GALLERY_FILES} images`,
          { status: 400 },
        )
      }

      const verified = await readVerifiedUploadFormData(context, {
        maxFiles: 4, // 1 file + a couple non-file parts
        maxTotalSize: 10 * 1024 * 1024 + 1024,
      })
      if (!verified.success) {
        if (verified.kind === 'csrf') return verified.response
        return new Response(verified.error.message, {
          status: verified.error.status,
        })
      }
      const formData = verified.value

      const file = formData.get('image')
      if (!(file instanceof File) || file.size === 0) {
        return new Response('No image provided', { status: 400 })
      }

      let storedUrl: string
      try {
        storedUrl = await processSurfaceUpload(file)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Upload failed'
        const status = error instanceof ProcessImageError && error.code === 'file_too_large' ? 413 : 400
        return new Response(message, { status })
      }

      await db.create(surfaceImages, {
        id: randomUUID(),
        surface_id: surface.id,
        image_url: storedUrl,
        is_primary: false,
        created_at: Date.now(),
      })

      return redirect(
        `/surface/${encodeURIComponent(surface.slug)}/edit`,
        303,
      )
    },
  },
})
```

- [ ] **Step 5.5: Create `app/actions/remove-surface-image/controller.tsx`**

```tsx
import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces, surfaceImages } from '../../data/schema.ts'
import { uploadStorage } from '../../data/uploads.ts'
import { routes } from '../../routes.ts'

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

export default createController(routes.removeSurfaceImage, {
  actions: {
    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, {
        where: { slug: context.params.slug },
      })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const image = await db.findOne(surfaceImages, {
        where: { id: context.params.imageId },
      })
      if (!image) return notFound()
      if (image.surface_id !== surface.id) {
        return new Response('Bad Request', { status: 400 })
      }

      // Can't remove the last image.
      const count = await db.count(surfaceImages, {
        where: { surface_id: surface.id },
      })
      if (count <= 1) {
        return new Response(
          'A surface must have at least one image',
          { status: 400 },
        )
      }

      const wasPrimary = Boolean(image.is_primary)

      await db.delete(surfaceImages, image.id)
      await safeRemoveStoredUpload(image.image_url)

      // Promote the next-oldest image if we just removed the primary.
      if (wasPrimary) {
        const remaining = await db.findMany(surfaceImages, {
          where: { surface_id: surface.id },
          orderBy: ['created_at', 'asc'],
          limit: 1,
        })
        if (remaining[0]) {
          await db.update(surfaceImages, remaining[0].id, {
            is_primary: true,
          })
        }
      }

      return redirect(
        `/surface/${encodeURIComponent(surface.slug)}/edit`,
        303,
      )
    },
  },
})
```

- [ ] **Step 5.6: Create `app/actions/set-primary-surface-image/controller.tsx`**

```tsx
import { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { getCurrentUser } from '../../data/current-user.ts'
import { surfaces, surfaceImages } from '../../data/schema.ts'
import { routes } from '../../routes.ts'

function notFound() {
  return new Response('Not Found', { status: 404 })
}

export default createController(routes.setPrimarySurfaceImage, {
  actions: {
    async action(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)

      const db = context.get(Database)
      const surface = await db.findOne(surfaces, {
        where: { slug: context.params.slug },
      })
      if (!surface) return notFound()
      if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
        return new Response('Forbidden', { status: 403 })
      }

      const image = await db.findOne(surfaceImages, {
        where: { id: context.params.imageId },
      })
      if (!image) return notFound()
      if (image.surface_id !== surface.id) {
        return new Response('Bad Request', { status: 400 })
      }

      // Transactional demote + promote. The partial unique index requires
      // that we demote the existing primary BEFORE promoting the new one,
      // otherwise the UNIQUE constraint fires.
      await db.transaction(async (tx) => {
        const currentPrimaries = await tx.findMany(surfaceImages, {
          where: { surface_id: surface.id, is_primary: true },
        })
        for (const p of currentPrimaries) {
          if (p.id !== image.id) {
            await tx.update(surfaceImages, p.id, { is_primary: false })
          }
        }
        await tx.update(surfaceImages, image.id, { is_primary: true })
      })

      return redirect(
        `/surface/${encodeURIComponent(surface.slug)}/edit`,
        303,
      )
    },
  },
})
```

- [ ] **Step 5.7: Run typecheck**

```bash
npm run typecheck
```

Expected: the 3 new controllers should typecheck. Surface-page / edit-surface / read sites still fail (that's later tasks).

- [ ] **Step 5.8: Commit**

```bash
git add app/routes.ts app/router.ts test/helpers.ts app/actions/add-surface-image/ app/actions/remove-surface-image/ app/actions/set-primary-surface-image/
git commit -m "add 3 form routes for surface gallery management"
```

---

## Task 6: Edit-surface controller + page

**Files:**
- Modify: `app/actions/edit-surface/controller.tsx`
- Modify: `app/actions/edit-surface-page.tsx`

- [ ] **Step 6.1: Update `edit-surface/controller.tsx` — drop image, pass gallery**

Open the existing file. The current shape: GET fetches the surface, POST validates name + description + optional image and updates the surface row + image_url. We're changing it so:

- GET still does the auth + UUID redirect + slug lookup.
- GET additionally fetches `surfaceImages` for this surface, ordered by `is_primary DESC, created_at ASC`.
- GET passes `images` to `EditSurfacePage`.
- POST drops all image handling. Only validates name + description and updates the surface row. Then 303 to show page.

Replace the body of the `action` (POST) action with this simplified version (the GET action body needs the images fetch added):

```tsx
// At the top, drop the optionalImage / image schema bits. The new schema:
const editSurfaceSchema = f.object({
  name: f.field(surfaceNameSchema),
  description: f.field(s.optional(surfaceDescriptionSchema)),
})
```

```tsx
// In the GET handler, after fetching the surface and the auth check:
const images = await db.findMany(surfaceImages, {
  where: { surface_id: surface.id },
  orderBy: [
    ['is_primary', 'desc'],
    ['created_at', 'asc'],
  ],
})

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
    }}
    images={images.map((img) => ({
      id: img.id,
      image_url: img.image_url,
      is_primary: Boolean(img.is_primary),
    }))}
    flash={flash}
  />,
)
```

```tsx
// In the POST handler, drop the multipart/image logic entirely. The new flow:

async action(context) {
  const user = getCurrentUser(context)
  if (!user) return redirect(routes.login.index.href(), 303)

  const db = context.get(Database)
  const surface = await db.findOne(surfaces, {
    where: { slug: context.params.slug },
  })
  if (!surface) return notFound()
  if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
    return new Response('Forbidden', { status: 403 })
  }

  const formData = context.get(FormData)
  const parsed = s.parseSafe(editSurfaceSchema, formData)
  if (!parsed.success) {
    const errors = issuesToFieldErrors(parsed.issues)
    const fallbackImages = await db.findMany(surfaceImages, {
      where: { surface_id: surface.id },
      orderBy: [
        ['is_primary', 'desc'],
        ['created_at', 'asc'],
      ],
    })
    return context.render(
      <EditSurfacePage
        user={user}
        surface={{
          id: surface.id,
          slug: surface.slug,
          name: String(formData.get('name') ?? ''),
          description: String(formData.get('description') ?? '') || null,
        }}
        images={fallbackImages.map((img) => ({
          id: img.id,
          image_url: img.image_url,
          is_primary: Boolean(img.is_primary),
        }))}
        errors={errors}
      />,
      { status: 400 },
    )
  }

  const { name, description } = parsed.value
  const changes: { name: string; description?: string; updated_at: number } = {
    name,
    updated_at: Date.now(),
  }
  // Codebase pattern: omit nullable when undefined; pass through when string.
  // For "clear to null" on description, the existing edit-sticker pattern uses
  // `null as unknown as undefined` — match that.
  if (description != null) {
    changes.description = description
  } else if (formData.has('description')) {
    // Submitted empty-string-after-trim — clear the column.
    ;(changes as any).description = null
  }

  await db.update(surfaces, surface.id, changes)

  const session = context.get(Session)
  session.flash('surface_flash', 'Surface updated.')
  return redirect(`/surface/${encodeURIComponent(surface.slug)}`, 303)
},
```

Drop the `optionalImage`, `safeRemoveStoredUpload`, and any other image-related imports/helpers from the file. They move to the new add/remove controllers (Task 5).

- [ ] **Step 6.2: Update `app/actions/edit-surface-page.tsx`**

The page needs:

1. New `images` prop (array of `{ id, image_url, is_primary }`).
2. The existing image input on the form — **remove it**. The form is now name + description + save.
3. New "gallery" section below the form, listing each image with action buttons:
   - "primary" badge if `is_primary`
   - "Set as primary" form (hidden if primary) → posts to `routes.setPrimarySurfaceImage.action.href({ slug, imageId })`
   - "Remove" form (disabled if N == 1) → posts to `routes.removeSurfaceImage.action.href({ slug, imageId })`
4. New "add image" form below the gallery (hidden if N == 8) → posts to `routes.addSurfaceImage.action.href({ slug })`, multipart, single file input, "Add image" submit.

Here's the props shape:

```ts
export interface EditSurfacePageProps {
  user: HeaderUser
  surface: {
    id: string
    slug: string
    name: string
    description: string | null
  }
  images: Array<{
    id: string
    image_url: string
    is_primary: boolean
  }>
  flash?: string
  errors?: { name?: string; description?: string; _form?: string }
}
```

(No more `image_url` on the surface object. No more `image` in errors — image errors come from the separate add-image route now.)

For the gallery section, follow the visual ethos: vertical stack of image cards, each with the image and an inline row of action buttons below. Use compact-height image style (`maxHeight: '22rem'`, `objectFit: 'contain'`) so management is visually scannable.

Roughly:

```tsx
<section mix={gallerySectionStyle}>
  <h2>images ({images.length})</h2>
  {images.map((img) => (
    <div key={img.id} mix={galleryItemStyle}>
      <img src={img.image_url} alt="" mix={galleryImgStyle} />
      <div mix={galleryActionsStyle}>
        {img.is_primary ? (
          <span mix={primaryBadgeStyle}>primary</span>
        ) : (
          <form
            method="post"
            action={routes.setPrimarySurfaceImage.action.href({
              slug: surface.slug,
              imageId: img.id,
            })}
            style={{ display: 'inline' }}
          >
            <CsrfField />
            <button type="submit">set primary</button>
          </form>
        )}
        <form
          method="post"
          action={routes.removeSurfaceImage.action.href({
            slug: surface.slug,
            imageId: img.id,
          })}
          style={{ display: 'inline' }}
        >
          <CsrfField />
          <button type="submit" disabled={images.length <= 1}>remove</button>
        </form>
      </div>
    </div>
  ))}

  {images.length < 8 ? (
    <form
      method="post"
      action={routes.addSurfaceImage.action.href({ slug: surface.slug })}
      encType="multipart/form-data"
      mix={addImageFormStyle}
    >
      <CsrfField />
      <input
        type="file"
        name="image"
        accept="image/png,image/jpeg,image/webp"
        required
      />
      <button type="submit">add image</button>
    </form>
  ) : null}
</section>
```

Define the new styles at the bottom of the file. Reuse existing colors/mixins from `theme.ts` where applicable. Keep it minimal — the form already uses inputStyle, etc.

- [ ] **Step 6.3: Run typecheck**

```bash
npm run typecheck
```

Expected: the edit-surface controller + page should typecheck now. Other files (surface-page, root controller, API, admin) still fail.

- [ ] **Step 6.4: Commit**

```bash
git add app/actions/edit-surface/controller.tsx app/actions/edit-surface-page.tsx
git commit -m "edit-surface: gallery management section, drop image field"
```

---

## Task 7: Surface show page renders gallery

**Files:**
- Modify: `app/actions/surface-page.tsx`
- Modify: `app/actions/controller.tsx` (`surface` action)

- [ ] **Step 7.1: Update `app/actions/surface-page.tsx`**

The current page receives `surface: { ..., image_url: string }` and renders one image. Change the prop shape to take an `images` array, render the primary first big, then the rest stacked vertically below the description.

New props:

```ts
export interface SurfacePageProps {
  user: HeaderUser | null
  surface: {
    id: string
    slug: string
    name: string
    description: string | null
    owner: { username: string; avatar_url: string | null }
  }
  images: Array<{
    id: string
    image_url: string
    is_primary: boolean
  }>
  canEdit: boolean
}
```

The render: the primary image (`images[0]` after sorting primary-first) gets the big top treatment. Below the description, render `images.slice(1).map(...)` as a vertical stack of full-width images. Reuse the same image style.

If the page currently uses OG metadata pointing at `surface.image_url`, switch to `images[0]?.image_url`.

- [ ] **Step 7.2: Update root controller `surface` action**

In `app/actions/controller.tsx`, find the `surface` action. After fetching the surface, fetch its images:

```tsx
const images = await db.findMany(surfaceImages, {
  where: { surface_id: surface.id },
  orderBy: [
    ['is_primary', 'desc'],
    ['created_at', 'asc'],
  ],
})
```

Pass them into `<SurfacePage>`. Drop the old `image_url` from the surface prop.

Add `surfaceImages` to the existing schema import.

- [ ] **Step 7.3: Run typecheck**

```bash
npm run typecheck
```

Expected: surface show + edit are clean. Still failing: home/profile/index/admin/API.

- [ ] **Step 7.4: Commit**

```bash
git add app/actions/surface-page.tsx app/actions/controller.tsx
git commit -m "surface-page: render primary + gallery stack"
```

---

## Task 8: Hydrate primary image_url in card-consuming controllers

**Files:**
- Modify: `app/actions/controller.tsx` (`home`, `profile`, `surfaces` index actions)
- Modify: `app/actions/admin/controller.tsx` (`surfaces` action)

Every place that constructs a `SurfaceCardSurface` prop needs to fetch the primary image URL for each surface.

- [ ] **Step 8.1: Write a small helper for the hydration pattern**

Add to the top of `app/actions/controller.tsx` (after imports, before the controller):

```ts
import { inList } from 'remix/data-table/operators'
import { surfaceImages, type Surface } from '../data/schema.ts'

const MISSING_IMAGE = '/images/banner.png'

/**
 * Build a `surface.id -> primary image_url` map for a batch of surfaces.
 * Surfaces without a primary fall back to a placeholder image.
 */
async function buildPrimaryImageMap(
  db: Database,
  surfaceRows: Surface[],
): Promise<Map<string, string>> {
  if (surfaceRows.length === 0) return new Map()
  const ids = surfaceRows.map((s) => s.id)
  // Fetch all images for these surfaces and filter primaries in JS — the
  // remix/data-table `where` clause API doesn't compose inList with another
  // equality cleanly across all adapters, so this is the portable shape.
  const allImages = await db.findMany(surfaceImages, {
    where: inList('surface_id', ids),
  })
  const map = new Map<string, string>()
  for (const img of allImages) {
    if (img.is_primary) map.set(img.surface_id, img.image_url)
  }
  return map
}
```

(If the helper signature is awkward to type with the runtime `Database`
type, take `db: any` — the controllers already use `as any` casts here
and there. The goal is to land the feature; type cleanup can be a
follow-up.)

If the helper feels overwrought for 4 call sites, inline the hydration
pattern at each. Decide based on readability.

- [ ] **Step 8.2: Update `home` action**

In the `home` action, after fetching `recentSurfaces` (or wherever surface rows are fetched), build the primary map and pass `image_url` to each card prop:

```tsx
const primaryMap = await buildPrimaryImageMap(db, recentSurfaceRows)
const recentSurfaces = recentSurfaceRows.map((s) => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  description: s.description,
  image_url: primaryMap.get(s.id) ?? MISSING_IMAGE,
  owner: { /* ... */ },
}))
```

Do the same for the Surface of the Day (`surfaceOfTheDay` prop). Either fetch its image separately (one `findOne`) or include it in the batch.

- [ ] **Step 8.3: Update `profile` action**

Same pattern: after fetching the user's surfaces, build the primary map, hydrate `image_url`.

- [ ] **Step 8.4: Update `surfaces` index action**

Same pattern.

- [ ] **Step 8.5: Update admin `surfaces` action in `app/actions/admin/controller.tsx`**

Same pattern. The admin page uses the same `SurfaceCardSurface` shape; hydrate `image_url` the same way. Import `buildPrimaryImageMap` or duplicate the logic depending on file structure.

- [ ] **Step 8.6: Run typecheck**

```bash
npm run typecheck
```

Expected: home/profile/index/admin are clean. Still failing: API.

- [ ] **Step 8.7: Commit**

```bash
git add app/actions/controller.tsx app/actions/admin/controller.tsx
git commit -m "hydrate primary image_url for surface card consumers"
```

---

## Task 9: JSON API

**Files:**
- Modify: `app/routes.ts` (3 new API routes)
- Modify: `app/actions/api/serializers.ts`
- Modify: `app/actions/api/controller.tsx`

- [ ] **Step 9.1: Add API routes**

Inside the existing `api` block in `app/routes.ts`, before the catch-all `notFound`:

```ts
  surfaceImageCreate: post('/surfaces/:id/images'),
  surfaceImageDestroy: del('/surfaces/:id/images/:imageId'),
  surfaceImageSetPrimary: post('/surfaces/:id/images/:imageId/primary'),
```

- [ ] **Step 9.2: Update `app/actions/api/serializers.ts`**

Update `JsonSurface`:

```ts
export interface JsonSurfaceImage {
  id: string
  image_url: string
  is_primary: boolean
}

export interface JsonSurface {
  id: string
  name: string
  slug: string
  description: string | null
  images: JsonSurfaceImage[]
  owner: JsonUserStub
  created_at: number
  updated_at: number
}
```

Update `serializeSurface`:

```ts
import type { Surface, SurfaceImage } from '../../data/schema.ts'

export function serializeSurface(
  surface: Surface,
  images: SurfaceImage[],
  owner: Pick<User, 'username' | 'avatar_url'>,
): JsonSurface {
  // Sort primary first, then by created_at asc.
  const sorted = [...images].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    return a.created_at - b.created_at
  })
  return {
    id: surface.id,
    name: surface.name,
    slug: surface.slug,
    description: surface.description,
    images: sorted.map((img) => ({
      id: img.id,
      image_url: img.image_url,
      is_primary: Boolean(img.is_primary),
    })),
    owner: serializeUserStub(owner),
    created_at: surface.created_at,
    updated_at: surface.updated_at,
  }
}

export function serializeSurfaceImage(img: SurfaceImage): JsonSurfaceImage {
  return {
    id: img.id,
    image_url: img.image_url,
    is_primary: Boolean(img.is_primary),
  }
}
```

The serializer now requires images to be pre-fetched.

- [ ] **Step 9.3: Update API actions in `app/actions/api/controller.tsx`**

Update the existing surface actions to fetch + pass images:

**`surfacesIndex`** — after fetching surfaces, batch-fetch all images via `inList('surface_id', surfaceIds)`, group by `surface_id`, then serialize each surface with its image group.

**`surfaceShow`** — after fetching the surface, `findMany(surfaceImages, { where: { surface_id: surface.id } })`, serialize.

**`surfaceCreate`** — change to multi-image. Same flow as the form route (Task 3): collect `image` files, validate 1-8, process each, transactional create of surface + N image rows. Return 201 with `serializeSurface(created, images, owner)`.

Use the same `MAX_GALLERY_FILES = 8` constant + upload override.

**`surfaceUpdate`** — only mutates name + description; image management is via the new endpoints. Refetch images after update to include in the response. No change to the schema validation.

**`surfaceDestroy`** — before delete, fetch all `surface_images` for the surface (need the URLs for cleanup). Delete the surface (CASCADE removes image rows). Then `safeRemoveStoredUpload(url)` for each.

**`userSurfaces`** — batch-fetch images like `surfacesIndex`.

Add three new actions:

**`surfaceImageCreate`** (`POST /api/surfaces/:id/images`):

Same shape as the form add-image route, JSON response:

```ts
async surfaceImageCreate(context) {
  const user = getCurrentUser(context)
  if (!user) return jsonError(401, 'unauthorized')

  const db = context.get(Database)
  const surface = await db.findOne(surfaces, {
    where: { id: context.params.id },
  })
  if (!surface) return jsonError(404, 'not_found')
  if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
    return jsonError(403, 'forbidden')
  }

  const currentCount = await db.count(surfaceImages, {
    where: { surface_id: surface.id },
  })
  if (currentCount >= 8) {
    return jsonError(400, 'too_many_images', { max: 8 })
  }

  const parsed = await readUploadFormData(context.request, {
    maxFiles: 4,
    maxTotalSize: 10 * 1024 * 1024 + 1024,
  })
  if (!parsed.success) {
    return jsonError(parsed.error.status, parsed.error.code, parsed.error.extras)
  }

  const file = parsed.value.get('image')
  if (!(file instanceof File) || file.size === 0) {
    return jsonError(400, 'no_image')
  }

  let storedUrl: string
  try {
    storedUrl = await processSurfaceUpload(file)
  } catch (error) {
    if (error instanceof ProcessImageError) {
      return jsonError(error.code === 'file_too_large' ? 413 : 400, error.code, { message: error.message })
    }
    return jsonError(400, 'upload_failed')
  }

  const imageId = randomUUID()
  await db.create(surfaceImages, {
    id: imageId,
    surface_id: surface.id,
    image_url: storedUrl,
    is_primary: false,
    created_at: Date.now(),
  })

  const created = await db.findOne(surfaceImages, { where: { id: imageId } })
  return new Response(JSON.stringify(serializeSurfaceImage(created!)), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  })
},
```

**`surfaceImageDestroy`** (`DELETE /api/surfaces/:id/images/:imageId`):

Same logic as the form remove-image controller, returns 204:

```ts
async surfaceImageDestroy(context) {
  const user = getCurrentUser(context)
  if (!user) return jsonError(401, 'unauthorized')

  const db = context.get(Database)
  const surface = await db.findOne(surfaces, {
    where: { id: context.params.id },
  })
  if (!surface) return jsonError(404, 'not_found')
  if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
    return jsonError(403, 'forbidden')
  }

  const image = await db.findOne(surfaceImages, {
    where: { id: context.params.imageId },
  })
  if (!image) return jsonError(404, 'not_found')
  if (image.surface_id !== surface.id) return jsonError(400, 'bad_request')

  const count = await db.count(surfaceImages, {
    where: { surface_id: surface.id },
  })
  if (count <= 1) return jsonError(400, 'last_image')

  const wasPrimary = Boolean(image.is_primary)
  await db.delete(surfaceImages, image.id)
  await safeRemoveStoredUpload(image.image_url)

  if (wasPrimary) {
    const remaining = await db.findMany(surfaceImages, {
      where: { surface_id: surface.id },
      orderBy: ['created_at', 'asc'],
      limit: 1,
    })
    if (remaining[0]) {
      await db.update(surfaceImages, remaining[0].id, { is_primary: true })
    }
  }

  return new Response(null, { status: 204 })
},
```

**`surfaceImageSetPrimary`** (`POST /api/surfaces/:id/images/:imageId/primary`):

```ts
async surfaceImageSetPrimary(context) {
  const user = getCurrentUser(context)
  if (!user) return jsonError(401, 'unauthorized')

  const db = context.get(Database)
  const surface = await db.findOne(surfaces, {
    where: { id: context.params.id },
  })
  if (!surface) return jsonError(404, 'not_found')
  if (surface.owner_id !== user.id && user.role !== 'ADMIN') {
    return jsonError(403, 'forbidden')
  }

  const image = await db.findOne(surfaceImages, {
    where: { id: context.params.imageId },
  })
  if (!image) return jsonError(404, 'not_found')
  if (image.surface_id !== surface.id) return jsonError(400, 'bad_request')

  await db.transaction(async (tx) => {
    const primaries = await tx.findMany(surfaceImages, {
      where: { surface_id: surface.id, is_primary: true },
    })
    for (const p of primaries) {
      if (p.id !== image.id) {
        await tx.update(surfaceImages, p.id, { is_primary: false })
      }
    }
    await tx.update(surfaceImages, image.id, { is_primary: true })
  })

  // Return the full updated surface for convenience.
  const owner = await db.findOne(users, { where: { id: surface.owner_id } })
  const allImages = await db.findMany(surfaceImages, {
    where: { surface_id: surface.id },
  })
  return jsonOk({ surface: serializeSurface(surface, allImages, owner!) })
},
```

- [ ] **Step 9.4: Run typecheck**

```bash
npm run typecheck
```

Expected: **CLEAN**. All app code is updated. Test code should also be clean since Task 4 updated fixtures.

If there are remaining errors, they're likely in spots I missed. Fix and re-run.

- [ ] **Step 9.5: Run tests**

```bash
npm test
```

Expected: **most or all existing tests pass.** Some may need their assertions updated (e.g., tests that read JSON responses and expected a top-level `image_url`). Update each by:

- `body.surface.image_url` → `body.surface.images[0].image_url` (or check via `.find((i) => i.is_primary)`)

Count failures. Fix each as a targeted edit. Goal: green suite before adding new tests.

- [ ] **Step 9.6: Commit**

```bash
git add app/routes.ts app/actions/api/ test/smoke.test.ts
git commit -m "api: multi-image surfaces + gallery management endpoints"
```

---

## Task 10: Add new gallery smoke tests + final verification + push

**Files:**
- Modify: `test/smoke.test.ts`
- Modify: `app/data/roadmap.ts` (optional touch-up)

Add tests for the new gallery features. ~12 tests covering form + API paths.

- [ ] **Step 10.1: Add form-route gallery tests**

In the `describe('surfaces', ...)` block of `test/smoke.test.ts`, add:

```ts
it('upload-surface accepts up to 8 images; first is primary', async () => {
  const env = await createTestEnv()
  try {
    await seedUser(env, 'gallery-uploader', 'pass')
    const sessionCookie = await loginAs(env, 'gallery-uploader', 'pass')
    const { token, cookie } = await fetchCsrf(env, routes.uploadSurface.index.href(), sessionCookie)

    // Generate 3 tiny PNGs via sharp.
    const sharp = (await import('sharp')).default
    async function makePng(colorR: number): Promise<File> {
      const buf = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: colorR, g: 0, b: 0 } },
      }).png().toBuffer()
      const view = new Uint8Array(new ArrayBuffer(buf.byteLength))
      view.set(buf)
      return new File([view], 'g.png', { type: 'image/png' })
    }

    const body = new FormData()
    body.set('_csrf', token)
    body.set('name', 'Triple Surface')
    body.append('image', await makePng(100))
    body.append('image', await makePng(150))
    body.append('image', await makePng(200))

    const res = await postMultipart(env, routes.uploadSurface.action.href(), { cookie, body })
    assert.equal(res.status, 303)

    // The created surface has 3 images, first is primary.
    const owner = await env.db.findOne(users, { where: { username: 'gallery-uploader' } })
    assert.ok(owner)
    const created = await env.db.findOne(surfaces, { where: { owner_id: owner.id } })
    assert.ok(created)
    const images = await env.db.findMany(surfaceImages, {
      where: { surface_id: created.id },
      orderBy: ['created_at', 'asc'],
    })
    assert.equal(images.length, 3)
    assert.equal(Boolean(images[0]!.is_primary), true, 'first image should be primary')
    assert.equal(Boolean(images[1]!.is_primary), false)
    assert.equal(Boolean(images[2]!.is_primary), false)
  } finally {
    env.cleanup()
  }
})

it('upload-surface rejects 9+ images', async () => {
  const env = await createTestEnv()
  try {
    await seedUser(env, 'too-many', 'pass')
    const sessionCookie = await loginAs(env, 'too-many', 'pass')
    const { token, cookie } = await fetchCsrf(env, routes.uploadSurface.index.href(), sessionCookie)

    const sharp = (await import('sharp')).default
    const buf = await sharp({
      create: { width: 30, height: 30, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).png().toBuffer()
    const view = new Uint8Array(new ArrayBuffer(buf.byteLength))
    view.set(buf)

    const body = new FormData()
    body.set('_csrf', token)
    body.set('name', 'Too Many')
    for (let i = 0; i < 9; i++) {
      body.append('image', new File([view], 'g.png', { type: 'image/png' }))
    }

    const res = await postMultipart(env, routes.uploadSurface.action.href(), { cookie, body })
    assert.equal(res.status, 400)
  } finally {
    env.cleanup()
  }
})

it('add-surface-image appends a non-primary image', async () => {
  const env = await createTestEnv()
  try {
    const ownerId = await seedUser(env, 'adder', 'pass')
    const { id, slug } = await seedSurface(env, { ownerId, name: 'Growable' })
    const sessionCookie = await loginAs(env, 'adder', 'pass')
    const { token, cookie } = await fetchCsrf(env, routes.editSurface.index.href({ slug }), sessionCookie)

    const sharp = (await import('sharp')).default
    const buf = await sharp({
      create: { width: 30, height: 30, channels: 3, background: { r: 50, g: 50, b: 50 } },
    }).png().toBuffer()
    const view = new Uint8Array(new ArrayBuffer(buf.byteLength))
    view.set(buf)
    const file = new File([view], 'g.png', { type: 'image/png' })

    const body = new FormData()
    body.set('_csrf', token)
    body.set('image', file)
    const res = await postMultipart(env, routes.addSurfaceImage.action.href({ slug }), { cookie, body })
    assert.equal(res.status, 303)

    const images = await env.db.findMany(surfaceImages, {
      where: { surface_id: id },
      orderBy: ['created_at', 'asc'],
    })
    assert.equal(images.length, 2)
    assert.equal(Boolean(images[0]!.is_primary), true)
    assert.equal(Boolean(images[1]!.is_primary), false)
  } finally {
    env.cleanup()
  }
})

it('set-primary-surface-image swaps which image is primary', async () => {
  const env = await createTestEnv()
  try {
    const ownerId = await seedUser(env, 'swapper', 'pass')
    const { id, slug, primaryImageId } = await seedSurface(env, { ownerId, name: 'Swap Me' })

    // Add a second image directly.
    const secondId = randomUUID()
    await env.db.create(surfaceImages, {
      id: secondId,
      surface_id: id,
      image_url: '/images/banner.png',
      is_primary: false,
      created_at: Date.now() + 1,
    })

    const sessionCookie = await loginAs(env, 'swapper', 'pass')
    const { token, cookie } = await fetchCsrf(env, routes.editSurface.index.href({ slug }), sessionCookie)

    const body = new FormData()
    body.set('_csrf', token)
    const res = await postForm(env, routes.setPrimarySurfaceImage.action.href({ slug, imageId: secondId }), { cookie, body })
    assert.equal(res.status, 303)

    const updatedFirst = await env.db.findOne(surfaceImages, { where: { id: primaryImageId } })
    const updatedSecond = await env.db.findOne(surfaceImages, { where: { id: secondId } })
    assert.equal(Boolean(updatedFirst?.is_primary), false)
    assert.equal(Boolean(updatedSecond?.is_primary), true)
  } finally {
    env.cleanup()
  }
})

it('remove-surface-image promotes next-oldest when removing primary', async () => {
  const env = await createTestEnv()
  try {
    const ownerId = await seedUser(env, 'remover', 'pass')
    const { id, slug, primaryImageId } = await seedSurface(env, { ownerId, name: 'Two-Image' })

    // Add a second image.
    const secondId = randomUUID()
    await env.db.create(surfaceImages, {
      id: secondId,
      surface_id: id,
      image_url: '/images/banner.png',
      is_primary: false,
      created_at: Date.now() + 1,
    })

    const sessionCookie = await loginAs(env, 'remover', 'pass')
    const { token, cookie } = await fetchCsrf(env, routes.editSurface.index.href({ slug }), sessionCookie)

    const body = new FormData()
    body.set('_csrf', token)
    const res = await postForm(env, routes.removeSurfaceImage.action.href({ slug, imageId: primaryImageId }), { cookie, body })
    assert.equal(res.status, 303)

    const promoted = await env.db.findOne(surfaceImages, { where: { id: secondId } })
    assert.equal(Boolean(promoted?.is_primary), true, 'second image should be promoted to primary')
    const removed = await env.db.findOne(surfaceImages, { where: { id: primaryImageId } })
    assert.equal(removed, null)
  } finally {
    env.cleanup()
  }
})

it('remove-surface-image rejects removing the last image', async () => {
  const env = await createTestEnv()
  try {
    const ownerId = await seedUser(env, 'last-image', 'pass')
    const { slug, primaryImageId } = await seedSurface(env, { ownerId, name: 'Only One' })

    const sessionCookie = await loginAs(env, 'last-image', 'pass')
    const { token, cookie } = await fetchCsrf(env, routes.editSurface.index.href({ slug }), sessionCookie)

    const body = new FormData()
    body.set('_csrf', token)
    const res = await postForm(env, routes.removeSurfaceImage.action.href({ slug, imageId: primaryImageId }), { cookie, body })
    assert.equal(res.status, 400)
  } finally {
    env.cleanup()
  }
})
```

- [ ] **Step 10.2: Add API gallery tests**

```ts
it('GET /api/surfaces/:id includes images array', async () => {
  const env = await createTestEnv()
  try {
    const ownerId = await seedUser(env, 'api-images', 'pass')
    const { id } = await seedSurface(env, { ownerId, name: 'Has Images' })

    const res = await env.fetch(new Request(buildUrl(routes.api.surfaceShow.href({ id }))))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(Array.isArray(body.surface.images))
    assert.equal(body.surface.images.length, 1)
    assert.equal(body.surface.images[0].is_primary, true)
  } finally {
    env.cleanup()
  }
})

it('POST /api/surfaces/:id/images appends a non-primary image with bearer auth', async () => {
  const env = await createTestEnv()
  try {
    const ownerId = await seedUser(env, 'api-adder', 'pass')
    const { id } = await seedSurface(env, { ownerId, name: 'Growable' })

    const ownerRow = await env.db.findOne(users, { where: { id: ownerId } })
    assert.ok(ownerRow)
    const { createTokenForUser } = await import('../app/data/api-tokens.ts')
    const token = (await createTokenForUser(env.db, ownerRow, 'add-test')).plaintext

    const sharp = (await import('sharp')).default
    const buf = await sharp({
      create: { width: 30, height: 30, channels: 3, background: { r: 100, g: 100, b: 100 } },
    }).png().toBuffer()
    const view = new Uint8Array(new ArrayBuffer(buf.byteLength))
    view.set(buf)

    const body = new FormData()
    body.set('image', new File([view], 'g.png', { type: 'image/png' }))

    const res = await env.fetch(
      new Request(buildUrl(routes.api.surfaceImageCreate.href({ id })), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body,
      }),
    )
    assert.equal(res.status, 201)
    const created = await res.json()
    assert.equal(created.is_primary, false)
    assert.ok(created.image_url)

    const all = await env.db.findMany(surfaceImages, { where: { surface_id: id } })
    assert.equal(all.length, 2)
  } finally {
    env.cleanup()
  }
})

it('POST /api/surfaces/:id/images/:imageId/primary swaps the primary', async () => {
  const env = await createTestEnv()
  try {
    const ownerId = await seedUser(env, 'api-swapper', 'pass')
    const { id, primaryImageId } = await seedSurface(env, { ownerId, name: 'API Swap' })

    const secondId = randomUUID()
    await env.db.create(surfaceImages, {
      id: secondId,
      surface_id: id,
      image_url: '/images/banner.png',
      is_primary: false,
      created_at: Date.now() + 1,
    })

    const ownerRow = await env.db.findOne(users, { where: { id: ownerId } })
    assert.ok(ownerRow)
    const { createTokenForUser } = await import('../app/data/api-tokens.ts')
    const token = (await createTokenForUser(env.db, ownerRow, 'primary-test')).plaintext

    const res = await env.fetch(
      new Request(buildUrl(routes.api.surfaceImageSetPrimary.href({ id, imageId: secondId })), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    assert.equal(res.status, 200)

    const updatedFirst = await env.db.findOne(surfaceImages, { where: { id: primaryImageId } })
    const updatedSecond = await env.db.findOne(surfaceImages, { where: { id: secondId } })
    assert.equal(Boolean(updatedFirst?.is_primary), false)
    assert.equal(Boolean(updatedSecond?.is_primary), true)
  } finally {
    env.cleanup()
  }
})

it('DELETE /api/surfaces/:id/images/:imageId rejects removing the last image', async () => {
  const env = await createTestEnv()
  try {
    const ownerId = await seedUser(env, 'api-lastimg', 'pass')
    const { id, primaryImageId } = await seedSurface(env, { ownerId, name: 'Only One' })

    const ownerRow = await env.db.findOne(users, { where: { id: ownerId } })
    assert.ok(ownerRow)
    const { createTokenForUser } = await import('../app/data/api-tokens.ts')
    const token = (await createTokenForUser(env.db, ownerRow, 'last-test')).plaintext

    const res = await env.fetch(
      new Request(buildUrl(routes.api.surfaceImageDestroy.href({ id, imageId: primaryImageId })), {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    assert.equal(res.status, 400)
  } finally {
    env.cleanup()
  }
})
```

- [ ] **Step 10.3: Run typecheck + tests**

```bash
npm run typecheck && npm test
```

Expected: all tests pass. Count: the 80 baseline tests should now all pass (after fixture updates from Task 4 and code updates from Tasks 5-9). Plus ~10 new gallery tests = 90 total.

If any tests fail, debug:
- Image processing flaky? Add retries or use smaller fixtures.
- Transaction not committing? Verify `db.transaction(async (tx) => {...})` is the right API.

- [ ] **Step 10.4: Update roadmap entry**

Edit `app/data/roadmap.ts`. Find the surfaces "Recently shipped" entry. Update or add a sub-bullet:

```
- [x] Multi-image galleries per surface (up to 8 images; one designated primary)
```

- [ ] **Step 10.5: Final manual browser verification**

```bash
SESSION_SECRET=dev npm run migrate
SESSION_SECRET=dev nohup npm run dev > /tmp/dev-server.log 2>&1 &
echo $! > /tmp/dev-server.pid
sleep 4
```

In a browser:
- Visit `/upload-surface`. Upload 3 images. URL becomes `/surface/<slug>`. Show page renders all 3 (primary first).
- Visit `/surface/<slug>/edit`. Gallery section shows 3 images with set-primary + remove buttons.
- Click "set primary" on the 2nd image. Show page now leads with image 2.
- Click "remove" on image 1. 2 images remain.
- Add a 4th image via the add form. 3 images now.
- Upload 9 files to `/upload-surface`. Form rejects with error.

Stop the server:

```bash
kill $(cat /tmp/dev-server.pid) 2>/dev/null
rm /tmp/dev-server.pid
```

- [ ] **Step 10.6: Commit + push**

```bash
git add test/smoke.test.ts app/data/roadmap.ts
git commit -m "tests: 10 new gallery tests + roadmap entry"
git push
```

PR #25 already exists; this push extends it. No new PR needed.

---

## Notes for the executing agent (final)

- **TDD discipline:** when adding a new test, run it first to confirm it fails (or fails for the right reason), then make it pass. Don't write tests after the code is already passing.
- **Test fixture migration is the largest mechanical chunk.** Don't fight it — replace every `db.create(surfaces, ...)` with `seedSurface(env, ...)`. The signature is uniform.
- **`db.transaction` semantics** depend on the adapter. SQLite via `node:sqlite` should support nested calls but don't rely on it. Keep each transaction flat (no awaits inside that branch out to another transaction).
- **The partial unique index on `is_primary = 1` is the load-bearing invariant.** If anything anywhere ever sets a second `is_primary = 1` without demoting first, you'll get a UNIQUE error. The set-primary controllers (form + API) do this correctly in transactions. The upload-surface controller does this correctly because it only sets the first inserted image to primary.
- **Don't shortcut the `boolean` column.** SQLite stores it as 0/1 and `remix/data-table` round-trips it, but you may need `Boolean(row.is_primary)` in spots where TS infers wrong. Test will catch it.
- **Stop the dev server if you started one** at end of Task 10. Don't leave it running.

