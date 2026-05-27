import { randomBytes, randomUUID } from 'node:crypto'

import bcrypt from 'bcryptjs'
import type { Database } from 'remix/data-table'

import { apiTokens, type User } from './schema.ts'

/**
 * Tokens look like `st_<48 hex chars>`. The `st_` prefix lets a leaked token
 * be recognised by automated secret scanners; the rest is high-entropy random.
 */
export const TOKEN_PREFIX = 'st_'
export const TOKEN_BYTES = 24 // -> 48 hex chars
export const PREFIX_LEN = 12 // first 12 chars of plaintext stored in the row for lookup

export interface CreatedToken {
  id: string
  plaintext: string
  prefix: string
  name: string
  created_at: number
}

/** Generate a fresh plaintext token. */
export function newPlaintextToken(): string {
  return TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('hex')
}

/**
 * Create a token row for a user. Returns the plaintext exactly once; the
 * caller is responsible for showing it to the user and never persisting it.
 */
export async function createTokenForUser(
  db: Database,
  user: Pick<User, 'id'>,
  name: string,
): Promise<CreatedToken> {
  const plaintext = newPlaintextToken()
  const prefix = plaintext.slice(0, PREFIX_LEN)
  const tokenHash = await bcrypt.hash(plaintext, 10)
  const id = randomUUID()
  const now = Date.now()
  await db.create(apiTokens, {
    id,
    user_id: user.id,
    name,
    token_hash: tokenHash,
    prefix,
    created_at: now,
  })
  return { id, plaintext, prefix, name, created_at: now }
}

/**
 * Verify a plaintext token. Returns the row on success, or null. Also touches
 * `last_used_at` so the UI can show recency.
 */
export async function verifyToken(
  db: Database,
  plaintext: string,
): Promise<{ user_id: string; token_id: string } | null> {
  if (!plaintext.startsWith(TOKEN_PREFIX)) return null
  const prefix = plaintext.slice(0, PREFIX_LEN)
  const candidates = await db.findMany(apiTokens, { where: { prefix } })
  for (const row of candidates) {
    if (await bcrypt.compare(plaintext, row.token_hash)) {
      // Best-effort touch — don't block verification on it.
      void db.update(apiTokens, row.id, { last_used_at: Date.now() }).catch(() => {})
      return { user_id: row.user_id, token_id: row.id }
    }
  }
  return null
}

export async function listTokensForUser(db: Database, userId: string) {
  return db.findMany(apiTokens, {
    where: { user_id: userId },
    orderBy: ['created_at', 'desc'],
  })
}
