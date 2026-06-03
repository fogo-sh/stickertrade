# Sticker Slugs Design

**Status:** Approved, ready for implementation plan
**Date:** 2026-06-03

## Goal

Replace UUIDs in public-facing sticker URLs with human-readable slugs. Same
treatment will apply to surfaces when that feature lands.

Today: `/sticker/5a2077e8-ef49-446b-aa27-dca99e15a9b4`
After:  `/sticker/dino-sticker-k3p9aq`

## Scope

### In scope

- `/sticker/:id` → `/sticker/:slug` (public show page)
- `/sticker/:id/edit` → `/sticker/:slug/edit` (edit form GET + POST)
- Schema migration: add `slug` column to `stickers`
- Backfill slugs for existing stickers
- UUID-shaped `:slug` values 301-redirect to the slug URL (preserves any
  existing shared links)

### Out of scope

- JSON API (`/api/stickers/:id` stays UUID — APIs prefer stable opaque IDs)
- All form action / POST targets, which are never shared as links:
  - `/profile/:username/remove-sticker/:stickerId`
  - `/admin/stickers/:id/delete`, `/admin/users/:id/delete`
  - `/account/tokens/:id/revoke`
  - `/invitations/:id/destroy`
- Invitations (`/invitation/:id`) — security-sensitive, UUID's unguessability
  is a feature, not a bug
- Slug regeneration on rename — the slug is frozen at sticker creation. If
  the name changes, the URL keeps the old slug. Matches our existing stance
  on usernames (also mutable, also not redirected).
- Sticker surfaces — separate feature; this design just establishes the
  pattern they'll reuse

## Slug Format

`<slug-part>-<suffix>`, where:

- **slug-part:** lowercase, ASCII alphanumeric and hyphens only, derived
  from the sticker name. Multiple non-alphanumeric chars collapse to a
  single hyphen; leading/trailing hyphens trimmed. Hard-capped at 40
  chars (trim, then re-trim any trailing hyphen left by the cut).
- **suffix:** 6 lowercase alphanumeric chars (`a-z0-9`), generated randomly
  at create time. ~31 bits of entropy, ~2B values — far more than this
  invite-only site will ever need. No collision-retry logic; we'll let
  SQLite's UNIQUE constraint surface the (vanishingly rare) collision and
  let the request fail. If it ever happens in practice, we revisit.

### Examples

| Name | Slug |
| --- | --- |
| `Dino Sticker` | `dino-sticker-k3p9aq` |
| `coffee & code` | `coffee-code-x7m2zp` |
| `🦖` | `k3p9aq` (suffix only, slug-part empty) |
| `   ` | `k3p9aq` (suffix only) |
| `A` × 200 | `<40 a's>-k3p9aq` (slug-part hard-capped at 40 chars) |

### Edge cases

- **Empty slug-part:** if slugifying the name yields an empty string (emoji
  names, whitespace-only names), the URL is just the suffix:
  `/sticker/k3p9aq`. Acceptable degradation.
- **Slugs that look like UUIDs:** essentially impossible — UUIDs contain
  hyphens at fixed positions and a fixed length (36 chars). Our slugs end
  in `-` + 6 chars and start with name-derived text. The UUID detector
  used for the redirect path is the standard UUID regex, which won't false-
  positive on our slugs.

## Schema Change

Our migration system is pure SQL (`migrations/<ts>_<slug>/{up,down}.sql`,
loaded by `remix/data-table/migrations/node`). No JS hook mid-migration.
This rules out generating name-derived slugs for existing stickers from
inside the migration. We accept that pre-migration stickers get
**suffix-only slugs** (e.g. `/sticker/a3f9b1`) and only new stickers get
the prettier `<name>-<suffix>` form. The number of pre-migration
stickers is tiny (handful in dev, small in prod), so this is fine.

**Migration up:** `<ts>_add_sticker_slug/up.sql`

```sql
ALTER TABLE stickers ADD COLUMN slug TEXT NOT NULL DEFAULT '';
UPDATE stickers SET slug = lower(hex(randomblob(3))) WHERE slug = '';
CREATE UNIQUE INDEX stickers_slug_unique ON stickers(slug);
```

`hex(randomblob(3))` yields 6 lowercase-hex chars (`0-9a-f`), which is a
subset of our `0-9a-z` runtime alphabet — backfilled slugs look the
same shape as freshly-generated ones, so lookup code doesn't need to
special-case them.

**Migration down:** `<ts>_add_sticker_slug/down.sql`

```sql
DROP INDEX stickers_slug_unique;
ALTER TABLE stickers DROP COLUMN slug;
```

(SQLite 3.35+ supports `DROP COLUMN`.)

All three `up.sql` steps run in the migration runner's transaction.
Partial failure rolls the whole thing back.

The TypeScript schema in `app/data/schema.ts` gets:

```ts
export const stickers = table({
  name: 'stickers',
  columns: {
    id: c.text().primaryKey(),
    name: c.text().notNull(),
    slug: c.text().notNull().unique(),  // new
    image_url: c.text().notNull(),
    owner_id: c.text(),
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})
```

## Code Changes

### New module: `app/data/slug.ts`

Two exports:

```ts
// "Dino Sticker" -> "dino-sticker"
// "🦖" -> ""
// trims to 40 chars max
export function slugifyName(name: string): string

// "Dino Sticker" -> "dino-sticker-k3p9aq"
// "" -> "k3p9aq"
export function generateStickerSlug(name: string): string
```

`generateStickerSlug` calls `slugifyName`, generates 6 random `a-z0-9`
chars via `node:crypto`, and joins with a hyphen (or returns just the
suffix if the slug-part is empty).

No external dependency for the suffix — `crypto.randomBytes` + a small
alphabet-encoder is enough. The existing codebase already uses
`node:crypto` for tokens.

### Route contract: `app/routes.ts`

```ts
sticker: '/sticker/:slug',
editSticker: form('/sticker/:slug/edit'),
```

Param name changes from `id` to `slug`. Every `routes.sticker.href({ id })`
call site updates to `routes.sticker.href({ slug })`. Without the rename
the typechecker would silently accept stale call sites; with it, every
call site fails until updated.

### Controller updates

Look up by slug instead of id. Add UUID-detection redirect at the top of
each show/edit handler:

```ts
const param = context.params.slug
if (UUID_REGEX.test(param)) {
  const sticker = await db.findOne(stickers, { where: { id: param } })
  if (!sticker) return notFound(...)
  return redirect(routes.sticker.href({ slug: sticker.slug }), 301)
}
const sticker = await db.findOne(stickers, { where: { slug: param } })
```

Call sites to update (already inventoried, ~7 sites):
- `app/actions/controller.tsx` sticker show
- `app/actions/edit-sticker/controller.tsx` (GET + POST)
- `app/actions/upload-sticker/controller.tsx` (post-create redirect)
- `app/ui/sticker-card.tsx`
- `app/actions/admin/admin-stickers-page.tsx`
- `app/actions/sticker-page.tsx` (OG canonical URL)
- `app/actions/edit-sticker-page.tsx` (cancel link)

### Sticker creation

`upload-sticker/controller.tsx` calls `generateStickerSlug(name)` and
inserts both `id` (UUID, unchanged) and `slug`. Post-create redirect uses
the new slug.

### Sticker rename

`edit-sticker/controller.tsx` does NOT recompute the slug. Frozen-at-
create, as discussed.

### Tests

Update `test/smoke.test.ts`:
- The two existing references to `routes.sticker.href({ id: stickerId })`
  switch to `{ slug: stickerSlug }`. The test will need to read the slug
  off the created sticker (either from the redirect's `Location` header
  or from a DB query in the test helper).
- Add a new test: GET `/sticker/<uuid>` 301-redirects to `/sticker/<slug>`
  for an existing sticker.
- Add a new test: GET `/sticker/<uuid>` returns 404 for a non-existent
  UUID (regression — current behaviour).

### Documentation

Roadmap entry under "Recently shipped" once landed. Brief mention.

## Migration & Rollout

1. Land the migration + backfill in a single PR. Existing dev DBs need
   `npm run migrate` to pick up the new column.
2. Prod gets the new column auto-applied on container boot via the
   existing migration-on-boot setup.
3. UUID-redirect path means any links shared before today keep working
   indefinitely. We can keep the redirect path forever — it's ~6 lines.

## Risks

- **`remix/data-table` `.unique()` on a new column:** confirm whether
  `.unique()` is honoured by the migration generator or only by the
  query builder. If only the latter, we need the raw `CREATE UNIQUE
  INDEX` in the migration SQL too (it's already there in this design).
- **`form()` route param rename:** Remix 3's `form()` macro accepts both
  GET and POST. POST requests to `/sticker/<uuid>/edit` won't hit the
  redirect path (we only redirect on GET). If someone bookmarks the
  edit page by UUID and submits, the POST will 404. Mitigation: the
  redirect handler runs on GET only; users land on the new URL before
  they submit, so the form's POST always targets the slug URL. Worst
  case: a stale bookmark to the edit page 404s on submit, which the
  user can recover from by re-navigating. Acceptable.
- **Migration backfill atomicity:** addressed by putting the
  `ALTER TABLE`, the backfill `UPDATE`, and the `CREATE UNIQUE INDEX`
  all in the same migration file. The migration runner runs each file
  in a transaction; if anything fails the whole migration rolls back.
- **`hex(randomblob(3))` collision for backfilled rows:** 16M values
  for ~dozens of pre-existing stickers means collision probability is
  negligible. If it happens, the unique index creation fails, the
  migration rolls back, and we re-run (different random output).

## Verification

After implementation:

- `npm test` — all 36 existing tests pass, plus the 2 new ones
- `npm run typecheck` — clean
- Manual browser check:
  - Upload a new sticker, verify the URL is `/sticker/<name>-<6chars>`
  - Visit the old UUID URL of an existing sticker, verify the 301
  - Rename a sticker, verify the URL stays the same (frozen slug)
  - Upload a sticker named `🦖`, verify URL is just the suffix
