# Surface Galleries Design

**Status:** Approved, ready for implementation plan
**Date:** 2026-06-03

## Goal

Extend the surfaces feature (in-flight on branch `sticker-surfaces`) so each
surface holds multiple images instead of one, with one image designated as
the primary. Primary is what shows on cards, the home page Surface of the
Day, and the admin moderation thumbnail. The show page renders the full
gallery as a vertical stack.

This change lands in the existing `sticker-surfaces` PR (#25) **before
merge**, so we get the schema right in a single release rather than
shipping single-image surfaces and migrating them later.

## Scope

### In scope

- New `surface_images` table; drop `image_url` from `surfaces`.
- Migration that backfills existing surfaces' single image into the new
  table as their primary.
- Multi-image upload on `/upload-surface` (up to 8 files; first is primary).
- Gallery management on `/surface/:slug/edit`: add more, remove individual,
  set primary. Each via its own POST form. No JS.
- Show page renders primary image first, then remaining gallery images
  stacked vertically.
- `SurfaceCard` keeps its single-image API (`image_url`); the controller
  computes the primary image's URL and passes it in.
- JSON API: `JsonSurface.images: [...]`, top-level `image_url` removed.
  Multi-file create. New gallery-management endpoints.
- Per-route override on `readVerifiedUploadFormData` so the surface upload
  route can accept more / larger files than the sticker default.

### Out of scope

- Per-image captions
- Reordering gallery images (sort by `created_at` ASC after primary)
- Hotswap / lightbox / JS-enhanced gallery UI
- Bulk operations on gallery images
- A separate "set primary" UI on the create form (first uploaded file is
  primary; user can change later on edit page)

## Data Model

### Schema

```ts
export const surfaces = table({
  name: 'surfaces',
  columns: {
    id: c.text().primaryKey(),
    name: c.text().notNull(),
    slug: c.text().notNull().unique(),
    description: c.text(),
    // image_url removed
    owner_id: c.text().notNull(),
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})

export const surfaceImages = table({
  name: 'surface_images',
  columns: {
    id: c.text().primaryKey(),                  // UUID
    surface_id: c.text().notNull(),             // FK → surfaces.id, CASCADE
    image_url: c.text().notNull(),
    is_primary: c.boolean().notNull(),
    created_at: c.integer().notNull(),
  },
})

export type SurfaceImage = TableRow<typeof surfaceImages>
```

`Surface` type loses `image_url`. Every reader is caught by the type
checker.

### Migration SQL

`migrations/<ts>_surface_galleries/up.sql`:

```sql
CREATE TABLE surface_images (
  id TEXT PRIMARY KEY,
  surface_id TEXT NOT NULL REFERENCES surfaces(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_primary INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX surface_images_surface_id_idx ON surface_images(surface_id);

-- Partial unique index: at most one primary per surface, enforced by SQLite.
CREATE UNIQUE INDEX surface_images_one_primary_per_surface
  ON surface_images(surface_id)
  WHERE is_primary = 1;

-- Backfill: every existing surface's single image becomes its primary.
-- The id is a UUID-shaped string assembled from random hex chunks, matching
-- the canonical 8-4-4-4-12 format the app produces via randomUUID() at
-- runtime. v4 marker (`-4xxx-`) included for parity.
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

`down.sql`:

```sql
-- Restore image_url from each surface's primary image.
ALTER TABLE surfaces ADD COLUMN image_url TEXT;
UPDATE surfaces
SET image_url = (
  SELECT image_url FROM surface_images
  WHERE surface_id = surfaces.id AND is_primary = 1
  LIMIT 1
);
-- (image_url is left nullable for any surface with no primary;
--  acceptable for a rollback scenario.)

DROP INDEX surface_images_one_primary_per_surface;
DROP INDEX surface_images_surface_id_idx;
DROP TABLE surface_images;
```

### Notes

- `is_primary` stored as `INTEGER` (0/1) per SQLite convention; the
  `remix/data-table` boolean column round-trips this.
- The partial unique index uses `WHERE is_primary = 1` so multiple
  `is_primary = 0` rows per surface are allowed (they're the gallery), but
  at most one `is_primary = 1` row. This is the DB-level invariant.
- CASCADE on `surface_id` means surface delete sweeps the images
  automatically. File cleanup is still the app's job.

## Routes

### Public + auth-gated (unchanged)
- `/surfaces`, `/surface/:slug`, `/upload-surface`, `/surface/:slug/edit`

### New form routes (added to `app/routes.ts`)
```ts
addSurfaceImage: form('/surface/:slug/images'),
removeSurfaceImage: form('/surface/:slug/images/:imageId/remove'),
setPrimarySurfaceImage: form('/surface/:slug/images/:imageId/primary'),
```

All three are POST handlers, slug-based for the surface, UUID-based for
the image. Owner-or-admin gated.

### New JSON API routes
```ts
surfaceImageCreate: post('/surfaces/:id/images'),
surfaceImageDestroy: del('/surfaces/:id/images/:imageId'),
surfaceImageSetPrimary: post('/surfaces/:id/images/:imageId/primary'),
```

UUID-based throughout, mirroring the rest of the JSON API.

## Controllers

### `upload-surface/controller.tsx` (modified)

Accepts up to 8 image files in the multipart body. Validation:
- At least 1 image.
- At most 8.
- Each file goes through the existing `processSurfaceUpload` pipeline
  (sharp + 2000px max edge + JPEG/PNG encode).

Flow:
1. Validate name + description via existing schemas.
2. Collect all `image` parts from the form data. Reject if 0 or >8.
3. Process each file in sequence via `processSurfaceUpload`. Track stored
   URLs in a list.
4. On any failure mid-batch, clean up the URLs stored so far via
   `safeRemoveStoredUpload`, then re-render the form with an error.
5. Insert the surface row + N `surface_images` rows. First file becomes
   primary (`is_primary = 1`); rest are non-primary in upload order.
6. Redirect to `/surface/${slug}`.

The multipart upload limit needs bumping for this route — see "Upload
limits override" below.

### `edit-surface/controller.tsx` (modified)

The edit form now manages **only** name + description. The "image" field
is removed entirely.

GET handler:
- Looks up surface (slug or UUID-redirect, same as today).
- Fetches `surface_images` for this surface, sorted by `is_primary DESC,
  created_at ASC` (primary first, rest in upload order).
- Renders `EditSurfacePage` with both the form fields and the gallery.

POST handler (action):
- Validates name + description only.
- Updates the row.
- 303 to `/surface/${slug}`.
- No image processing in this controller anymore.

### `add-surface-image/controller.tsx` (new)

Tiny POST handler. Mapped from `routes.addSurfaceImage`.

1. Auth + owner-or-admin gate (look up surface by slug).
2. Parse 1 file from multipart body via `readVerifiedUploadFormData` with
   `maxFiles: 1` override.
3. Count existing `surface_images` for this surface. If >= 8, render the
   edit page with an error and 400.
4. Process the image via `processSurfaceUpload`.
5. Insert a new `surface_images` row with `is_primary = 0`.
6. 303 redirect back to `/surface/${slug}/edit`.

### `remove-surface-image/controller.tsx` (new)

POST handler. Mapped from `routes.removeSurfaceImage`.

1. Auth + owner-or-admin gate.
2. Look up the image by id. 404 if missing. 400 if `surface_id` doesn't
   match `params.slug`'s surface (URL tampering).
3. Count existing images. If count == 1, return 400 (can't remove the
   last image — a surface must have at least one).
4. Remember whether the row being deleted is the primary.
5. Delete the row.
6. Clean up the stored upload file via `safeRemoveStoredUpload`.
7. If the deleted row was primary, promote the next-oldest remaining
   image: `UPDATE surface_images SET is_primary = 1 WHERE surface_id = ?
   ORDER BY created_at ASC LIMIT 1`. No demotion needed since the
   previous primary is already gone.
8. 303 redirect to `/surface/${slug}/edit`.

### `set-primary-surface-image/controller.tsx` (new)

POST handler. Mapped from `routes.setPrimarySurfaceImage`.

1. Auth + owner-or-admin gate.
2. Look up the image. 404 if missing. 400 if surface mismatch.
3. In a transaction:
   - `UPDATE surface_images SET is_primary = 0 WHERE surface_id = ? AND is_primary = 1`
   - `UPDATE surface_images SET is_primary = 1 WHERE id = ?`
4. 303 redirect to `/surface/${slug}/edit`.

The transaction is required because the partial unique index would
otherwise reject an interim "two primaries" state.

### Root controller `surface` action (modified)

When fetching a surface for the show page:
1. Look up surface (existing logic).
2. Fetch `surface_images` for the surface, sorted by `is_primary DESC,
   created_at ASC`. (One query.)
3. Pass `images: [...]` as a prop to `SurfacePage`.

The primary image is `images[0]`. Non-primary images are `images.slice(1)`.

### Root controller `home`, `profile`, `stickers`/`surfaces` index, admin (modified)

Anywhere `SurfaceCard` is rendered, we need the primary image's URL.

Pattern: after fetching the surfaces for these views, fetch all primary
`surface_images` rows in a single query keyed by `surface_id`:

```ts
const surfaceIds = rows.map((s) => s.id)
const primaries = surfaceIds.length
  ? await db.findMany(surfaceImages, {
      where: { ...inList('surface_id', surfaceIds), is_primary: true },
    })
  : []
const primaryBySurfaceId = new Map(primaries.map((p) => [p.surface_id, p.image_url]))
```

(The exact composition of `inList(...)` with an additional `is_primary`
condition depends on the `remix/data-table` `where` clause API. If
spread-merging doesn't work, fall back to two queries: fetch the primary
ids via `findMany(..., { where: inList('surface_id', surfaceIds) })`,
then filter in JS by `is_primary`. The implementation plan should verify
the API shape before committing.)

Then when constructing each card's prop:

```ts
image_url: primaryBySurfaceId.get(s.id) ?? '/images/missing-image.webp'
```

Fallback to a placeholder image when a surface has zero images (shouldn't
happen via the app, but the type system can't enforce "always at least
one image"). Use `/images/banner.png` if no dedicated placeholder exists.

### Surface of the Day (modified)

`getSurfaceOfTheDay(db)` continues to return a `Surface`. The home
controller separately fetches the primary image for that surface (one
extra `findOne` keyed by `surface_id` + `is_primary`). Done in the same
`Promise.all` batch as the other home queries.

## Upload Limits Override

The existing `UPLOAD_LIMITS` in `app/utils/upload.ts` has:
- `maxFiles: 4`
- `maxTotalBytes: 11 * 1024 * 1024`

These are right for stickers and avatars. For surface upload + add-image
we need:
- `maxFiles: 8`
- `maxTotalBytes: 88 * 1024 * 1024` (8 × 10 MiB + a bit)

Approach: extend `readVerifiedUploadFormData(context, options?)` to
accept optional per-call overrides:

```ts
interface ReadVerifiedUploadOptions {
  maxFiles?: number
  maxTotalBytes?: number
}
```

Default to the existing constants. Surface upload passes
`{ maxFiles: 8, maxTotalBytes: 88 * 1024 * 1024 }`. Add-image passes
`{ maxFiles: 1, maxTotalBytes: 10 * 1024 * 1024 + 1024 }` (room for
multipart overhead).

The `readUploadFormData` non-CSRF variant gets the same treatment so the
API endpoints can use it.

## Page Layout

### `surface-page.tsx` (modified)

```
[Document]
  [Document chrome — Header, OG tags, etc.]
  [Big image: images[0].image_url at native aspect, full width]
  [Title]
  [Owner attribution]
  [Description]
  [Gallery: images.slice(1).map(...) — each at native aspect, full width,
   stacked vertically with same spacing as cards]
  [canEdit ? edit + remove buttons]
[/Document]
```

Each gallery image is rendered as a simple `<img>` block with the same
`maxWidth` and aspect-preserving style as the primary. No clickability
yet (no lightbox); the show page is a long-form scroll.

### `edit-surface-page.tsx` (modified)

```
[Document]
  [Form: name + description, save button]
  [Gallery section heading: "images (N)"]
  [For each image in surface_images (primary first):
    [Image at compact height ~22rem, object-fit contain]
    [Label: "primary" badge if is_primary, else nothing]
    [Form: set-primary button (hidden if already primary)]
    [Form: remove button (disabled if N == 1)]
  ]
  [Add-image form: single file input, "add image" submit button (hidden if N == 8)]
  [Cancel link → show page]
[/Document]
```

The compact-height treatment in the edit gallery is so the user can see
multiple images at once for management. Same `maxHeight: '22rem',
objectFit: 'cover'` style from the home SotD's `compact` mode, possibly
extracted into a reusable mixin.

### `upload-surface-page.tsx` (modified)

Change the file input to `multiple` and accept up to 8:
```html
<input type="file" name="image" multiple accept="..." required />
```

Add helper text: "select up to 8 images. the first will be the primary."

Error rendering when N > 8 or N == 0 is straightforward; the user
re-selects.

### `SurfaceCard` (unchanged interface)

The component's `SurfaceCardSurface` type continues to have `image_url:
string`. The card displays one image. Controllers compute the primary URL
and pass it in. No changes to the component's internals.

### Profile, Home, Admin, /surfaces index pages

No layout changes. All consume `SurfaceCardSurface` which still has
`image_url`. The controllers hydrate the primary URL into that field.

## JSON API

### `JsonSurface` shape

```ts
export interface JsonSurface {
  id: string
  name: string
  slug: string
  description: string | null
  images: Array<{
    id: string
    image_url: string
    is_primary: boolean
  }>
  owner: JsonUserStub
  created_at: number
  updated_at: number
}
```

`images` is sorted primary-first, then `created_at` ascending. The
top-level `image_url` is **removed** (we're pre-release; no consumers
to break).

### `serializeSurface(surface, images, owner)` signature change

The serializer takes the surface row, an array of `SurfaceImage` rows
pre-sorted, and the owner. Returns the JSON shape above.

Callers must pre-fetch the images. Helpers in the API controller
(`hydrateOneSurface`, `hydrateManySurfaces`) wrap the FK queries to keep
the action handlers readable.

### Endpoint behavior

- `GET /api/surfaces` — for each surface, fetch its images. Use one batched
  `inList` query to avoid N+1. Hydrate into `JsonSurface[]`.
- `GET /api/surfaces/:id` — fetch + serialize.
- `POST /api/surfaces` — accepts multiple `image` parts. First is primary.
  Same 1-8 file count validation as the form route.
- `PATCH /api/surfaces/:id` — unchanged (only mutates name/description).
- `DELETE /api/surfaces/:id` — fetches all `surface_images` rows for the
  surface first, deletes the surface (CASCADE drops the image rows), then
  cleans up each stored file via `safeRemoveStoredUpload`.
- `GET /api/users/:username/surfaces` — same batched-images hydration as
  the index.

### New API endpoints

- `POST /api/surfaces/:id/images` — auth, owner-or-admin, parses 1 file,
  checks count, inserts non-primary, returns 201 with the new
  `JsonSurfaceImage` shape: `{ id, image_url, is_primary }`.
- `DELETE /api/surfaces/:id/images/:imageId` — auth, owner-or-admin,
  same "last image" rejection (400), same primary-promotion. Returns 204.
- `POST /api/surfaces/:id/images/:imageId/primary` — auth, owner-or-admin,
  transactional set-primary. Returns 200 with the updated surface JSON.

## Tests

### Migration test (new addition to `test/migrations.test.ts`)

- Insert a user + a surface (with the pre-migration schema's `image_url`
  column intact — i.e., run the test at the migration boundary).
- Apply the surface_galleries migration.
- Assert: `surfaces.image_url` no longer exists (try to read it via raw
  SQL, expect error).
- Assert: `surface_images` has one row for the original surface,
  `is_primary = 1`, `image_url` matches the original.
- Assert: partial unique index rejects a second `is_primary = 1` row for
  the same surface.

### Smoke tests (additions to `test/smoke.test.ts`)

- Upload with 1 image succeeds (existing test still passes after fixture
  update).
- Upload with 4 images succeeds, all images stored, first is primary,
  rest are gallery in order.
- Upload with 9 images returns 400.
- Show page renders primary image + gallery (assert HTML contains both
  the primary and a gallery image url).
- Edit page renders the gallery management UI for the owner.
- Add image to existing surface: POST to addSurfaceImage, GET edit page,
  count increased by 1, new image is non-primary.
- Set primary: POST to setPrimarySurfaceImage, fetch fresh surface_images,
  the chosen image is primary, the old primary is no longer primary.
- Remove non-primary image: succeeds, count decreases.
- Remove primary image: succeeds, next-oldest image is promoted.
- Remove last image: returns 400.
- Cascade test: deleting a surface deletes all its surface_images
  (existing migration test extended).
- API: POST /api/surfaces with multiple files, GET /api/surfaces/:id with
  images array, gallery management endpoints.

### Test fixture updates

Every existing test that inserts a surface row directly into the DB
needs updating to also insert a primary `surface_images` row. Add a
helper to `test/helpers.ts`:

```ts
export async function seedSurface(env, opts: {
  ownerId: string
  name: string
  description?: string
  imageUrl?: string
}): Promise<{ id: string; slug: string }>
```

That creates both the surface and its primary image. Use it everywhere
existing tests do `env.db.create(surfaces, ...)`.

## File Cleanup

### On `processSurfaceUpload` mid-batch failure (create flow)

Track stored URLs in an array as each file processes. On any failure:

```ts
for (const url of storedUrls) {
  await safeRemoveStoredUpload(url)
}
```

Then re-render the form with an error.

### On `add-surface-image` failure after sharp succeeds but DB insert fails

Same pattern: clean up the stored file before returning the error.

### On `remove-surface-image`

Same as today's sticker remove: `safeRemoveStoredUpload(image.image_url)`
after the DB delete.

### On surface delete (form + API)

Before the surface is deleted, fetch all its image rows. After CASCADE
delete completes, iterate and `safeRemoveStoredUpload` each.

## Migration & Rollout

Single PR (this one — #25). The migration runs cleanly against the
current single-image rows (which haven't been deployed to prod yet).
Backfill creates one primary image per existing row; no app behaviour
should change for callers who treat surfaces as "has one image."

After merge, existing dev DBs pick up via `npm run migrate`. Prod boot
auto-applies on first deploy.

## Risks

- **Mid-batch upload failure cleanup is not transactional.** If the
  process crashes between storing files and inserting DB rows, we have
  orphaned files. Not new (sticker upload has the same property);
  acceptable.
- **Partial unique index race window on set-primary.** Two concurrent
  set-primary requests for the same surface could both pass the SELECT
  step before either runs the UPDATE. The transaction's atomicity
  serializes the UPDATEs, but one will hit a UNIQUE conflict on the
  second statement. Mitigation: catch the UNIQUE error in the
  set-primary controller and retry once (or 5xx — concurrent set-primary
  by the same user is unusual and a retry is cheap).
- **Soft cap of 8 images at add-image time.** Two concurrent add-image
  requests at count = 7 could both pass the count check. Acceptable
  for v1 — cap is "soft." Belt-and-braces: also gate at the UI (hide
  "add" form when count == 8).
- **Database rollback path leaves nullable `image_url`** on the surfaces
  table. Documented in the down.sql header.

## Verification

After implementation:
- `npm test` — existing tests pass after fixture updates, plus ~15 new
  tests for upload/add/remove/set-primary/cascade/API.
- `npm run typecheck` — clean (every `image_url` read on surfaces is
  caught and fixed).
- Manual browser:
  - Upload a surface with 3 images. URL is `/surface/<slug>`. Show page
    shows all 3 images stacked, primary on top.
  - Visit edit page. Gallery section shows all 3 images with set-primary
    buttons. Add a 4th image. Refresh — 4 images visible. Set the 4th as
    primary. Remove the original primary. Verify the show page now
    leads with the 4th image.
  - Upload-surface with 9 files returns the form with an error message.
  - Visit home page — Surface of the Day shows the primary image.
  - Visit profile page — surface card shows the primary image.
