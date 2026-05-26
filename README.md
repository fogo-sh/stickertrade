# stickertrade

an invite-only sticker trading site, running on [Remix 3].
originally a [Remix v1] app — the previous tree is in the git history
prior to the `port to remix 3` commit if you want to look back.

[Remix v1]: https://remix.run
[Remix 3]: https://remix.run/blog/remix-3-beta-preview

## Stack

- **Remix 3** (`remix` ^3.0.0-beta) — router, controllers, middleware, UI runtime,
  asset pipeline, file storage, auth/session middleware, data-table ORM, all from
  a single npm package
- **Node 24+** with the built-in `node:sqlite`
- **`sharp`** for sticker image optimization
- **`bcryptjs`** for password hashing
- **`marked`** + **`front-matter`** + **`feed`** for the dev-logs blog and its
  RSS / Atom / JSON feeds

## Quick start

```sh
npm install
cp .env.dist .env       # then fill in SESSION_SECRET
npm run migrate
npm run seed
npm run dev
```

Then open [http://localhost:44100](http://localhost:44100).

Scripts load `.env` automatically via Node's `--env-file-if-exists` flag, so
you only need to set vars on the command line for one-off overrides.

Seeded credentials:

- `admin` / `changeme` (admin)
- `alice` / `alicepass` (regular user, has a sample sticker)

## Scripts

| Script              | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Dev server with `node --watch`                     |
| `npm start`         | Production-style boot                              |
| `npm run migrate`   | Apply `migrations/*` SQL migrations                |
| `npm run seed`      | Seed admin + sample user / sticker / invitation    |
| `npm test`          | Run `node --test` smoke suite                      |
| `npm run typecheck` | `tsc --noEmit`                                     |

## Environment

| Var               | Default                          | Notes                                       |
| ----------------- | -------------------------------- | ------------------------------------------- |
| `SESSION_SECRET`  | _required_ (except in `--test`)  | Used to sign the session cookie             |
| `DATABASE_URL`    | `./db/stickertrade.sqlite`       | Path to SQLite file                         |
| `PORT`            | `44100`                          | HTTP listen port                            |
| `NODE_ENV`        | `development`                    | Toggles dev logger, cookie secure flag, etc |

See [`AGENTS.md`](./AGENTS.md) for architecture and conventions.
