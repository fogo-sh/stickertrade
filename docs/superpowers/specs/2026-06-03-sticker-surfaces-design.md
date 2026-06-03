# Sticker Surfaces Design

**Status:** Approved, ready for implementation plan
**Date:** 2026-06-03

## Goal

Introduce a new content type — **surfaces** — distinct from stickers. A
surface is a photo of a real-world object (laptop, fridge, water bottle,
car) covered in stickers the owner has already applied. Surfaces are
personal documentation, not tradeable stock.

Add a daily-rotating "Surface of the Day" feature on the home page, with
the pick history persisted so we can build an archive page later.

## Scope

### In scope

- `surfaces` table + `surface_features` table.
- Public pages: `/surfaces` (index), `/surface/:slug` (show), with the
  same UUID → slug 301 redirect as stickers.
- Auth-gated pages: `/upload-surface`, `/surface/:slug/edit`.
- Form POST targets (UUID): `/profile/:username/remove-surface/:surfaceId`,
  `/admin/surfaces/:id/delete`.
- Admin moderation: `/admin/surfaces` index + per-row delete.
- JSON API: `GET/POST/PATCH/DELETE /api/surfaces[/:id]` + `GET /api/users/:username/surfaces`.
- Profile page: surfaces section below the existing stickers grid.
- Home page: "Surface of the Day" block above the existing content.
- Image pipeline: `processSurfaceUpload()` — same sharp + WebP encode
  as stickers, no center-crop, preserve native aspect ratio.
- Rename `generateStickerSlug` → `generateContentSlug` and update its 3
  call sites; the function was never sticker-specific.

### Out of scope

- "Surface of the Day" archive page (the data is in the DB; rendering
  comes later).
- Likes / comments on surfaces.
- Linking surfaces to specific stickers (e.g., "which stickers are on
  this surface").
- Cropping / annotation tooling.
- Recency / diversity weighting in the daily pick. Pure uniform random.
- Trading or transferring surface ownership.

## Data Model

```ts
export const surfaces = table({
  name: 'surfaces',
  columns: {
    id: c.text().primaryKey(),                  // UUID
    name: c.text().notNull(),                   // e.g. "My laptop"
    slug: c.text().notNull().unique(),          // e.g. "my-laptop-k3p9aq"
    description: c.text(),                      // nullable, free-text
    image_url: c.text().notNull(),              // e.g. /uploads/<uuid>.webp
    owner_id: c.text().notNull(),               // FK -> users.id, CASCADE
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})

export const surface_features = table({
  name: 'surface_features',
  columns: {
    id: c.integer().primaryKey().autoIncrement(),
    surface_id: c.text().notNull(),             // FK -> surfaces.id, CASCADE
    featured_date: c.text().notNull().unique(), // 'YYYY-MM-DD' UTC
    created_at: c.integer().notNull(),
  },
})
```

### Migration SQL

`migrations/<ts>_add_surfaces/up.sql`:

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

`down.sql`:

```sql
DROP TABLE surface_features;
DROP TABLE surfaces;
```

No backfill needed — both tables are empty at creation.

### Notes on schema

- `owner_id` is `NOT NULL` with `ON DELETE CASCADE`. Surfaces are
  intrinsically personal; deleting a user removes their surfaces. This
  is a deliberate departure from stickers, where `owner_id` is nullable
  (deleted user → orphaned sticker that can re-circulate via trading).
- `surface_id` on `surface_features` also `CASCADE`s. Deleting a
  surface (by owner or admin) cleans up its feature-history rows.
- `featured_date` is `YYYY-MM-DD` UTC text. Sorts lexicographically by
  date, enforces one-row-per-day via `UNIQUE`.

## Routes

Additions to `app/routes.ts`:

```ts
// Public pages
surfaces: '/surfaces',
surface: '/surface/:slug',
editSurface: form('/surface/:slug/edit'),

// Form actions (UUID params, never shared)
uploadSurface: form('/upload-surface'),
removeSurface: form('/profile/:username/remove-surface/:surfaceId'),

// Admin (existing route map gets two new keys)
admin: route('/admin', {
  // ...existing keys...
  surfaces: get('/surfaces'),
  deleteSurface: post('/surfaces/:id/delete'),
}),

// JSON API (existing route map gets six new keys)
api: route('/api', {
  // ...existing keys...
  surfacesIndex: get('/surfaces'),
  surfaceShow: get('/surfaces/:id'),
  surfaceCreate: post('/surfaces'),
  surfaceUpdate: patch('/surfaces/:id'),
  surfaceDestroy: del('/surfaces/:id'),
  userSurfaces: get('/users/:username/surfaces'),
}),
```

URL convention mirrors stickers exactly. Slug-based public pages with
UUID → slug 301 redirects (using the existing `looksLikeUuid` helper).
UUID-only form actions / API / admin.

## Daily Pick Algorithm

Lives in `app/data/surface-of-the-day.ts`:

```ts
import { Database } from 'remix/data-table'
import { surfaces, surface_features, type Surface } from './schema.ts'

export async function getSurfaceOfTheDay(db: Database): Promise<Surface | null> {
  const todayUtc = new Date().toISOString().slice(0, 10)  // 'YYYY-MM-DD'

  // 1. Did we already pick today?
  const existing = await db.findOne(surface_features, {
    where: { featured_date: todayUtc },
  })
  if (existing) {
    const surface = await db.findOne(surfaces, { where: { id: existing.surface_id } })
    if (surface) return surface
    // Surface was deleted after being picked. Drop the stale feature row,
    // fall through, and re-roll.
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

Properties:

- **Lazy, on-demand.** No background job. First home-page hit of the day
  pays the roll cost (a `count` + an indexed `offset` query + an
  insert). Subsequent hits are a single indexed `findOne`.
- **Returns `null` for empty surfaces.** Home page omits the block.
- **Returns `null` for "today's pick exists but the surface was deleted
  and re-roll happened to find no surfaces left."** Same display branch.
- **Race-safe.** SQLite `UNIQUE(featured_date)` enforces one row per
  day; losing requests catch the error and re-read.
- **Self-healing on delete.** If today's pick gets deleted mid-day, the
  next request notices the missing surface, drops the stale feature
  row, and rolls a fresh pick.

Called from: `app/actions/controller.tsx` `home` action.

## Image Pipeline

Add `processSurfaceUpload(file: File): Promise<string>` to
`app/data/upload-image.ts`. Behavior:

1. Read sharp metadata. If MIME is not `image/{jpeg,png,webp}`, throw
   `ProcessImageError`.
2. Resize so the longest side ≤ 2000px (preserve aspect ratio, no
   center-crop).
3. Strip metadata (EXIF) for privacy.
4. Encode to WebP at quality 85.
5. If encoded buffer > 1 MiB, re-encode at quality 75. If still > 1
   MiB, re-encode at 65. Beyond that, accept the buffer.
6. Generate a UUID filename, persist via the existing
   `remix/file-storage/fs` upload storage, return `/uploads/<uuid>.webp`.

This is the existing sticker pipeline minus the center-crop step. The
sticker function (`processStickerUpload`) stays unchanged.

## Form Validation

Add to `app/data/validators.ts`, using the existing `boundedString`
helper for consistency:

```ts
/** Surface names are 1-80 chars after trimming. */
export const surfaceNameSchema = boundedString(1, 80, 'Name must be 1-80 characters')

/**
 * Surface descriptions are optional, up to 500 chars. An empty or
 * whitespace-only submission becomes `null` so the column stays clean.
 */
export const surfaceDescriptionSchema = s
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length <= 500, 'Description must be 500 characters or less')
  .transform((value) => (value.length === 0 ? null : value))
```

The form-data field-level handling (whether the field is `s.optional(...)`
or always present) is decided at the field-binding site in the controller
schema, matching how `editStickerSchema` does its optional `image` field
in `app/actions/edit-sticker/controller.tsx`.

Upload limits (`UPLOAD_LIMITS` in `app/utils/upload.ts`) are shared with
stickers — 10 MiB per file, 11 MiB total, 4 files max, 100 parts max.

## Slug Helper Rename

In `app/data/slug.ts`:

- Rename `generateStickerSlug` → `generateContentSlug`. The function was
  never sticker-specific; the runtime alphabet, suffix length, and
  40-char cap apply equally to surfaces.
- Update the 3 call sites: `app/actions/upload-sticker/controller.tsx`,
  `scripts/seed.ts`, `test/smoke.test.ts`.
- `slugifyName` and `looksLikeUuid` keep their names.

## Page Layout

### Home page (`app/actions/home-page.tsx`)

New block at the top, above the existing recent-stickers grid:

- Heading: `Surface of the Day`.
- If non-null: surface image at native aspect (max-width ~800px,
  centered), title link, description preview (first ~120 chars),
  owner attribution ("by [username]").
- If null: block is omitted entirely. No empty-state placeholder.

### Profile page (`app/actions/profile-page.tsx`)

New section below the existing stickers grid:

- Heading: `Surfaces` with the count (e.g., `Surfaces (3)`).
- Single-column vertical stack, each surface rendered via
  `<SurfaceCard />`, max-width 600px centered within the section.
- If the user has zero surfaces, the whole section is hidden (no empty
  "Surfaces (0)" header).

### `/surfaces` index page

Same single-column vertical stack. Recent-first ordering. Paginated at
the same page size as stickers (20). If zero surfaces, show "No surfaces
yet" placeholder.

### `/surface/:slug` show page

Big image at native aspect ratio (max-width ~1000px), title, full
description, owner attribution with avatar + link to profile. Edit /
remove links visible to owner and admin.

### `/upload-surface` and edit pages

Standard forms: name (required), description (optional textarea, ~5
rows), image (required for upload, optional for edit). Same per-route
controller pattern as stickers.

## Components

### `app/ui/surface-card.tsx`

Visual primitive used by both the profile section and the `/surfaces`
index. Receives a surface object (`{ id, slug, name, description,
image_url, owner }`) and renders:

- The image at native aspect, full-width-of-container.
- Title (linked to show page).
- Owner attribution.
- Description preview (truncated at ~120 chars) if present.

Used in vertical-stack contexts, max-width controlled by the parent
container.

### `app/actions/surfaces-page.tsx`, `surface-page.tsx`, `upload-surface-page.tsx`, `edit-surface-page.tsx`

One file each. Page component receives data from the controller and
renders the layout described above. Style mixins follow the existing
sticker-page patterns.

## Controllers

### `app/actions/controller.tsx` (root, extended)

- `surfaces` action — index. `db.findMany(surfaces, { orderBy: ['created_at', 'desc'], limit, offset })`. Renders `<SurfacesPage />`.
- `surface` action — show. Identical structure to the sticker show
  action: look up by slug, redirect UUID-shaped params via
  `looksLikeUuid` + `encodeURIComponent`. Renders `<SurfacePage />`.
- Extend the `home` action to call `getSurfaceOfTheDay(db)` and pass
  the result to `<HomePage />`.
- Extend the `profile` action to fetch the user's surfaces in addition
  to their stickers.

### `app/actions/upload-surface/controller.tsx` (new)

Mirrors `upload-sticker/controller.tsx`:

- `index` action: GET form (auth required).
- `action` action: POST handler. Parses multipart via
  `readVerifiedUploadFormData`. Validates via `surfaceNameSchema` +
  `surfaceDescriptionSchema`. Processes the image via
  `processSurfaceUpload`. Generates slug via `generateContentSlug(name)`.
  Creates the row. Redirects to `/surface/${encodeURIComponent(slug)}`.

### `app/actions/edit-surface/controller.tsx` (new)

Mirrors `edit-sticker/controller.tsx`:

- GET `index`: look up by slug, UUID-shaped param redirects with
  `encodeURIComponent`. Auth-gated (owner or admin).
- POST `action`: look up by slug only (UUID-shaped POST → 404). Update
  name / description / image. Slug is frozen on rename, just like
  stickers.

### `app/actions/remove-surface/controller.tsx` (new)

Single POST handler. Owner or admin only. Looks up by `:surfaceId`
(UUID). Deletes the row (CASCADE removes feature rows). Redirects to
the owner's profile.

### `app/actions/admin/controller.tsx` (extended)

Two new actions:

- `surfaces` — index. Same pagination pattern as admin stickers.
- `deleteSurface` — POST. Admin-gated. Deletes the row.

### `app/actions/api/controller.tsx` (extended)

Six new actions: `surfacesIndex`, `surfaceShow`, `surfaceCreate`,
`surfaceUpdate`, `surfaceDestroy`, `userSurfaces`. Same shape and auth
boundaries as the sticker endpoints. Use `serializeSurface` from
`app/actions/api/serializers.ts`.

### `app/actions/api/serializers.ts` (extended)

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
): JsonSurface
```

`owner` is non-null because `surfaces.owner_id` is NOT NULL.

## Router Wiring

`app/router.ts` adds three new controller mappings:

```ts
router.map(routes.editSurface, editSurfaceController)
router.map(routes.uploadSurface, uploadSurfaceController)
router.map(routes.removeSurface, removeSurfaceController)
```

The `surfaces` and `surface` keys are top-level leaf routes, so they're
picked up by the existing `router.map(routes, rootController)` line and
handled inside `app/actions/controller.tsx` — same pattern as
`stickers` and `sticker`.

## Tests

### Unit: `test/surface-of-the-day.test.ts` (new)

In-memory SQLite, fresh DB per test. Cases:

- Empty surfaces → returns `null`.
- One surface, no feature row → picks it, persists a feature row, both
  reads after return same surface.
- One surface, today's feature row exists → returns same surface
  without writing a new row (verify by counting `surface_features`).
- Today's feature row points at a deleted surface → returns a freshly
  picked surface (or null if no surfaces remain), stale row removed.
- Two parallel first-of-day calls → both return same surface, only one
  `surface_features` row exists.

### Migration: `test/migrations.test.ts` (extended)

Add an assertion that the new migration creates both tables, both
unique indexes, and rejects duplicate `featured_date` inserts. Roughly
the same shape as the existing slug-migration test.

### Smoke: `test/smoke.test.ts` (extended)

Analogous to existing sticker coverage. Roughly:

- Upload surface (success + validation failures).
- Show page renders by slug.
- UUID → slug 301 redirect on show page.
- UUID → slug 301 redirect on edit page.
- Phantom UUID → 404.
- Edit / rename (with frozen-slug assertion, mirroring the rename test
  for stickers).
- Owner can remove; non-owner gets 403.
- Admin can delete via admin page.
- API: index, show, create (auth required), update (owner only), delete
  (owner only), userSurfaces.
- Profile page renders the surfaces section when present.
- Home page renders the Surface of the Day block when surfaces exist;
  omits it when empty.

## Roadmap

After landing, the roadmap (`app/data/roadmap.ts`) gets a new
"Recently shipped" entry summarising surfaces + surface-of-the-day.

## Migration & Rollout

1. Single PR. New tables, new pages, new controllers, slug helper
   rename.
2. Existing dev DBs pick up via `npm run migrate`.
3. Prod auto-applies the migration on container boot.
4. Initial state: zero surfaces. Home page omits the Surface of the Day
   block. First user upload → first day's feature on the next home page
   load.

## Risks

- **`generateStickerSlug` → `generateContentSlug` rename touches 3
  call sites.** The typechecker will catch any missed call. Tests pin
  the behaviour. Risk is low; flagged for the implementation plan to
  enumerate every site explicitly.
- **Random pick uses `Math.random()`.** Not cryptographically random,
  but doesn't need to be — this is a feature for "look at someone's
  cool laptop," not a lottery. Acceptable.
- **`db.query(surfaces).offset(N).limit(1)` performance for large
  pools.** SQLite uses the primary-key index; `offset` scans through
  but `limit(1)` short-circuits. Fine for thousands of rows. If the
  table grows to millions, revisit. (Spoiler: it won't.)
- **The `home` action now does an extra DB call per request.** Mostly
  a cached `findOne` after the first hit of the day. One extra
  indexed lookup per home page visit. Negligible.
- **Image storage growth.** Surfaces are larger than stickers (up to
  ~1 MiB each after WebP encoding, vs ~50-200 KiB for stickers).
  At 100 surfaces/user × 10 users = ~1 GiB of disk over time. Within
  prod's tmp/uploads/ budget; revisit if the site grows past a
  reasonable scale.

## Verification

- `npm test` — all existing 52 tests pass, plus new ones (estimated
  ~20-25 new tests across smoke + surface-of-the-day + migrations).
- `npm run typecheck` — clean.
- Manual browser checks:
  - Upload a surface with name + description + image. Verify URL is
    `/surface/<name>-<6chars>`.
  - Visit the UUID URL of an existing surface, verify 301 to slug.
  - Rename a surface, verify the slug URL stays the same.
  - Visit home page with zero surfaces — no Surface of the Day block.
  - Upload one surface, refresh home page — surface appears.
  - Refresh home page again — same surface (cached for the day).
  - Manually update the DB's `featured_date` to yesterday, refresh —
    a new pick is rolled.
  - Delete the featured surface as admin, refresh home page — fresh
    pick rolls automatically.
