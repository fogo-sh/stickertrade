import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { DatabaseSync } from 'node:sqlite'
import { createDatabase, Database } from 'remix/data-table'
import { createSqliteDatabaseAdapter } from 'remix/data-table/sqlite'
import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'
import { compression } from 'remix/middleware/compression'
import { formData } from 'remix/middleware/form-data'
import { staticFiles } from 'remix/middleware/static'
import { auth, createSessionAuthScheme } from 'remix/middleware/auth'
import { session } from 'remix/middleware/session'
import { createCookie } from 'remix/cookie'
import { createMemorySessionStorage } from 'remix/session-storage/memory'
import { createRouter, type MiddlewareContext } from 'remix/router'

import rootController from '../app/actions/controller.tsx'
import adminController from '../app/actions/admin/controller.tsx'
import changePasswordController from '../app/actions/change-password/controller.tsx'
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

export async function createTestEnv(): Promise<TestEnv> {
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
      ],
    })
  }

  const stack = [
    compression(),
    staticFiles('./public', { index: false }),
    formData(),
    session(sessionCookie, sessionStorage),
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

export async function loginAs(
  env: TestEnv,
  username: string,
  password: string,
): Promise<string> {
  const body = new FormData()
  body.set('username', username)
  body.set('password', password)
  const res = await env.fetch(
    new Request(buildUrl(routes.login.action.href()), { method: 'POST', body }),
  )
  if (res.status !== 303) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`)
  }
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error('No session cookie in login response')
  return setCookie.split(';')[0]
}
