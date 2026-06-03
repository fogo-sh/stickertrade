import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { DatabaseSync } from 'node:sqlite'
import { createDatabase, Database } from 'remix/data-table'
import { createSqliteDatabaseAdapter } from 'remix/data-table/sqlite'
import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'
import { asyncContext } from 'remix/middleware/async-context'
import { compression } from 'remix/middleware/compression'
import { staticFiles } from 'remix/middleware/static'
import {
  auth,
  createBearerTokenAuthScheme,
  createSessionAuthScheme,
} from 'remix/middleware/auth'
import { session } from 'remix/middleware/session'

import { csrfOrBearer } from '../app/middleware/csrf-or-bearer.ts'
import { formDataExceptUploads } from '../app/middleware/form-data.ts'
import { verifyToken } from '../app/data/api-tokens.ts'
import { createCookie } from 'remix/cookie'
import { createMemorySessionStorage } from 'remix/session-storage/memory'
import { createRouter, type MiddlewareContext } from 'remix/router'

import rootController from '../app/actions/controller.tsx'
import adminController from '../app/actions/admin/controller.tsx'
import apiController from '../app/actions/api/controller.tsx'
import changePasswordController from '../app/actions/change-password/controller.tsx'
import editProfileController from '../app/actions/edit-profile/controller.tsx'
import editStickerController from '../app/actions/edit-sticker/controller.tsx'
import invitationsController from '../app/actions/invitations/controller.tsx'
import invitationController from '../app/actions/invitation/controller.tsx'
import loginController from '../app/actions/login/controller.tsx'
import removeStickerController from '../app/actions/remove-sticker/controller.tsx'
import uploadStickerController from '../app/actions/upload-sticker/controller.tsx'
import { render } from '../app/middleware/render.tsx'
import { routes } from '../app/routes.ts'
import { users, type User } from '../app/data/schema.ts'

export interface TestEnv {
  fetch: (request: Request) => Promise<Response>
  db: Database
  cleanup: () => void
}

export interface CreateTestEnvOptions {
  /** Override the allowed CSRF origin (defaults to undefined = same-origin only). */
  publicOrigin?: string | string[]
}

export async function createTestEnv(options: CreateTestEnvOptions = {}): Promise<TestEnv> {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'stickertrade-test-'))
  const dbPath = path.join(tmpDir, 'test.sqlite')
  const sqlite = new DatabaseSync(dbPath)
  sqlite.exec('PRAGMA foreign_keys = ON')

  const adapter = createSqliteDatabaseAdapter(sqlite)
  const db = createDatabase(adapter)

  // Apply migrations to the fresh database.
  const migrations = await loadMigrations('./migrations')
  const runner = createMigrationRunner(adapter, migrations)
  await runner.up()

  const sessionCookie = createCookie('stickertrade_test_session', {
    secrets: ['test-only-secret'],
    httpOnly: true,
    sameSite: 'Lax',
    secure: false,
    path: '/',
  })
  const sessionStorage = createMemorySessionStorage()

  function loadTestDatabase() {
    return async (
      context: { set: (key: typeof Database, value: Database) => void },
      next: () => Promise<Response>,
    ) => {
      context.set(Database, db)
      return next()
    }
  }

  function loadTestAuth() {
    return auth({
      schemes: [
        createSessionAuthScheme<User, { userId: string }>({
          read(s) {
            return (s.get('auth') as { userId: string } | undefined) ?? null
          },
          async verify(value, context) {
            const inner = context.get(Database)
            if (!inner) return null
            return (await inner.findOne(users, { where: { id: value.userId } })) ?? null
          },
          invalidate(s) {
            s.unset('auth')
          },
        }),
        createBearerTokenAuthScheme<User>({
          async verify(token, context) {
            const inner = context.get(Database)
            if (!inner) return null
            const match = await verifyToken(inner, token)
            if (!match) return null
            return (await inner.findOne(users, { where: { id: match.user_id } })) ?? null
          },
        }),
      ],
    })
  }

  const stack = [
    compression(),
    staticFiles('./public', { index: false }),
    formDataExceptUploads(),
    session(sessionCookie, sessionStorage),
    csrfOrBearer({ origin: options.publicOrigin }),
    asyncContext(),
    loadTestDatabase() as any,
    loadTestAuth(),
    render(),
  ] as const

  type Ctx = MiddlewareContext<typeof stack>
  const router = createRouter<Ctx>({ middleware: stack as unknown as any[] })

  router.map(routes, rootController as any)
  router.map(routes.admin, adminController as any)
  router.map(routes.invitations, invitationsController as any)
  router.map(routes.invitation, invitationController as any)
  router.map(routes.login, loginController as any)
  router.map(routes.changePassword, changePasswordController as any)
  router.map(routes.editProfile, editProfileController as any)
  router.map(routes.editSticker, editStickerController as any)
  router.map(routes.api, apiController as any)
  router.map(routes.removeSticker, removeStickerController as any)
  router.map(routes.uploadSticker, uploadStickerController as any)

  return {
    fetch: (request: Request) => router.fetch(request),
    db,
    cleanup: () => {
      sqlite.close()
      rmSync(tmpDir, { recursive: true, force: true })
    },
  }
}

const BASE = 'http://localhost'

export function buildUrl(pathname: string): string {
  return BASE + pathname
}

/**
 * Fetch a page that contains a CSRF-protected form and return both the session
 * cookie installed by the response and the `_csrf` token embedded in the HTML.
 * Useful for stitching together a request that needs to satisfy CSRF.
 */
export async function fetchCsrf(
  env: TestEnv,
  url: string,
  cookie?: string,
): Promise<{ token: string; cookie: string }> {
  const headers = new Headers({ origin: BASE })
  if (cookie) headers.set('cookie', cookie)
  const res = await env.fetch(new Request(buildUrl(url), { headers }))
  const html = await res.text()
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/)
  if (!match) throw new Error(`No _csrf token in response from ${url}`)
  const setCookie = res.headers.get('set-cookie')
  const nextCookie = setCookie ? setCookie.split(';')[0] : cookie ?? ''
  return { token: match[1]!, cookie: nextCookie }
}

/**
 * Send a POST as `application/x-www-form-urlencoded`, matching what a real
 * browser sends for `<form method="post">` without `enctype="multipart/form-data"`.
 * Use this for every non-file-upload form (login, change password, etc.).
 */
export async function postForm(
  env: TestEnv,
  pathname: string,
  options: { cookie?: string; body: FormData | URLSearchParams | Record<string, string> },
): Promise<Response> {
  const headers = new Headers({
    origin: BASE,
    'content-type': 'application/x-www-form-urlencoded',
  })
  if (options.cookie) headers.set('cookie', options.cookie)

  let bodyString: string
  if (options.body instanceof URLSearchParams) {
    bodyString = options.body.toString()
  } else if (options.body instanceof FormData) {
    const params = new URLSearchParams()
    for (const [key, value] of options.body.entries()) {
      if (typeof value === 'string') params.append(key, value)
    }
    bodyString = params.toString()
  } else {
    bodyString = new URLSearchParams(options.body).toString()
  }

  return env.fetch(
    new Request(buildUrl(pathname), { method: 'POST', headers, body: bodyString }),
  )
}

/**
 * Send a POST as `multipart/form-data`, matching what a real browser sends for
 * `<form enctype="multipart/form-data">`. Use this for file-upload routes.
 */
export async function postMultipart(
  env: TestEnv,
  pathname: string,
  options: { cookie?: string; headers?: Record<string, string>; body: FormData },
): Promise<Response> {
  const headers = new Headers({ origin: BASE, ...(options.headers ?? {}) })
  if (options.cookie) headers.set('cookie', options.cookie)
  return env.fetch(
    new Request(buildUrl(pathname), {
      method: 'POST',
      headers,
      body: options.body,
    }),
  )
}

export async function loginAs(
  env: TestEnv,
  username: string,
  password: string,
): Promise<string> {
  // First, fetch /login to get a CSRF token + session cookie.
  const { token, cookie: preCookie } = await fetchCsrf(env, routes.login.index.href())
  const res = await postForm(env, routes.login.action.href(), {
    cookie: preCookie,
    body: { _csrf: token, username, password },
  })
  if (res.status !== 303) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`)
  }
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error('No session cookie in login response')
  return setCookie.split(';')[0]
}
