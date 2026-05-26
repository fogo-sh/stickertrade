import { Auth } from 'remix/middleware/auth'

import type { User } from './schema.ts'

export type AuthedUser = Pick<
  User,
  'id' | 'username' | 'role' | 'avatar_url' | 'invitation_limit'
>

interface AuthContext {
  get(key: typeof Auth): unknown
}

export function getCurrentUser(context: AuthContext): AuthedUser | null {
  const auth = context.get(Auth) as { ok: boolean; identity?: AuthedUser } | undefined
  if (!auth || !auth.ok || !auth.identity) return null
  return auth.identity
}

export function requireCurrentUser(context: AuthContext): AuthedUser {
  const user = getCurrentUser(context)
  if (!user) throw new Response('Unauthorized', { status: 401 })
  return user
}

export function requireAdmin(context: AuthContext): AuthedUser {
  const user = requireCurrentUser(context)
  if (user.role !== 'ADMIN') throw new Response('Forbidden', { status: 403 })
  return user
}
