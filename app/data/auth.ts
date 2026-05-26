import bcrypt from 'bcryptjs'
import { Database } from 'remix/data-table'
import { auth, createSessionAuthScheme } from 'remix/middleware/auth'
import { createCookie } from 'remix/cookie'
import { createFsSessionStorage } from 'remix/session-storage/fs'
import { session } from 'remix/middleware/session'

import { users, type User } from './schema.ts'

const isTest = process.env.NODE_ENV === 'test'
const isProd = process.env.NODE_ENV === 'production'

const sessionSecret = process.env.SESSION_SECRET ?? (isTest ? 'test-only-secret' : null)
if (!sessionSecret) {
  throw new Error('SESSION_SECRET is required outside of tests')
}

export const sessionCookie = createCookie('stickertrade_session', {
  secrets: [sessionSecret],
  httpOnly: true,
  sameSite: 'Lax',
  secure: isProd,
  maxAge: 60 * 60 * 24 * 30,
  path: '/',
})

export const sessionStorage = isTest
  ? createFsSessionStorage('./tmp/test-sessions')
  : createFsSessionStorage('./tmp/sessions')

export function appSession() {
  return session(sessionCookie, sessionStorage)
}

export function loadAuth() {
  return auth({
    schemes: [
      createSessionAuthScheme<User, { userId: string }>({
        read(s) {
          return (s.get('auth') as { userId: string } | undefined) ?? null
        },
        async verify(value, context) {
          const db = context.get(Database)
          if (!db) return null
          const user = await db.findOne(users, { where: { id: value.userId } })
          return user ?? null
        },
        invalidate(s) {
          s.unset('auth')
        },
      }),
    ],
  })
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, 10)
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}
