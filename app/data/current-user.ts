import { Auth } from 'remix/middleware/auth'

import type { User } from './schema.ts'

export type AuthedUser = Pick<
  User,
  'id' | 'username' | 'role' | 'avatar_url' | 'invitation_limit'
>

interface AuthContext {
  get(key: typeof Auth): unknown
}

/**
 * Read the authenticated user from request context, or `null` if the
 * request is anonymous. Controllers branch on the return value and return
 * a `Response` (redirect to login / 401 / etc.) for the unauth path —
 * we don't throw for control flow per the Remix skill.
 */
export function getCurrentUser(context: AuthContext): AuthedUser | null {
  const auth = context.get(Auth) as { ok: boolean; identity?: AuthedUser } | undefined
  if (!auth || !auth.ok || !auth.identity) return null
  return auth.identity
}
