# stickertrade Agent Guide

stickertrade is an invite-only sticker trading site, running on Remix 3. The
old Remix v1 app was removed; see git history before the `port to remix 3`
commit if you need to look back at the original.

## Commands

```sh
npm i                       # install deps
npm run migrate             # apply SQL migrations to db/stickertrade.sqlite
npm run seed                # seed admin + sample user/sticker/invitation
SESSION_SECRET=... npm run dev   # dev server with watch
SESSION_SECRET=... npm start     # production-style boot
npm test                    # node --test smoke suite
npm run typecheck           # tsc --noEmit
```

A `SESSION_SECRET` env var is required outside of tests. Default seed creds:
`admin` / `changeme` (admin) and `alice` / `alicepass`.

## Building Features

Refer to `./.agents/skills/remix/SKILL.md` and the linked references for the
Remix 3 conventions (routes contract, controllers per nested route map, mixin
styling, etc.). The Remix v3 mental model in one sentence: routes are the
contract, controllers return `Response` objects, middleware enriches the
request, components are not React.

## Layout

- `app/routes.ts` — the typed URL contract; use `routes.foo.href(...)` for every URL
- `app/router.ts` — composes the middleware stack and maps each route map to a controller
- `app/actions/controller.tsx` — root controller for top-level leaf routes
- `app/actions/<route-key>/controller.tsx` — one controller per nested route map (`admin`,
  `invitations`, `invitation`, `login`, `upload-sticker`, `remove-sticker`)
- `app/actions/*-page.tsx` — page components, returned via `context.render(...)`
- `app/ui/` — shared UI primitives (`document.tsx`, `header.tsx`, `footer.tsx`,
  `sticker-card.tsx`, `user-card.tsx`, `form.tsx`, `theme.ts`)
- `app/data/` — schema, db wiring, auth, dev-logs loader, roadmap, upload pipeline
- `app/middleware/` — `database.ts` and `render.tsx`
- `app/utils/time.ts` — small relative-time formatter
- `migrations/<timestamp>_<slug>/{up,down}.sql` — SQL migrations
- `scripts/migrate.ts`, `scripts/seed.ts` — one-shot operational scripts
- `test/` — `node --test` smoke suite + a `helpers.ts` that spins up an isolated router/db
- `dev-logs/` — markdown dev logs surfaced at `/dev-logs` and as RSS/Atom/JSON feeds
- `tmp/` — `tmp/uploads/` for sticker images, `tmp/sessions/` for session storage

## Conventions

- Routes for forms (`form(...)`) and nested route maps live in their own controller under
  `app/actions/<route-key>/controller.tsx`; only top-level leaf routes belong in the root
  controller.
- Controllers return explicit `Response` objects (use `redirect(...)` or `context.render(...)`).
  Reserve thrown errors for genuinely unexpected failures.
- Styling is `remix/ui` `css(...)` mixins; design tokens live in `app/ui/theme.ts`.
- Auth checks are inline in controllers via `getCurrentUser(context)` / `requireAdmin(context)`
  from `app/data/current-user.ts` (the admin controller centralises its check in an
  `ensureAdmin` helper).
- File uploads go through `app/data/upload-sticker.ts`, which validates type/size and uses
  `sharp` to optimize images before persisting to `tmp/uploads/` via `remix/file-storage/fs`.
  The `uploads` route in the root controller serves them as a resource route.

## Things The Original Had That We Did Not Bring Forward

- The Minio/S3 storage backend (already commented out in v1).
- The admin multi-select + modal-confirm flow. The new admin pages do inline per-row
  POST deletes — simpler, no client JS needed.
- The Tailwind utility classes (`button-light`, `button-dark`, etc.). Styling is now
  per-component `css(...)` mixins.
- The "data has been lost" splash that hijacked `/` in v1.
- Real CSRF tokens. Add `csrf()` middleware before going public if mutations need it.

## Things To Watch Out For

- `context.get(Database)` (and friends) can return `T | undefined` when the controller's
  context type isn't fully tracked. The router type narrowing depends on `RouterTypes.context`
  in `app/router.ts` resolving to `MiddlewareContext<typeof stack>`. If a new middleware is
  added, double-check it shows up in the controllers' `get` signatures.
- SQLite `BOOLEAN` columns round-trip as `0`/`1`. Cast with `Boolean(...)` when reading.
- The Remix 3 component model is not React. Components have shape
  `function Foo(handle: Handle<Props>) { return () => <jsx using handle.props /> }`. Inline
  JSX-returning helpers without that shape will fail typechecking — extract them into proper
  components (see `app/ui/form.tsx`).
- `remix/data-table` `where: { col: { in: [...] } }` is not supported directly; use
  `inList('col', [...])` from `remix/data-table/operators`.
