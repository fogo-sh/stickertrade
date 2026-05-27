import type { Sticker, User } from '../../data/schema.ts'

export interface JsonSticker {
  id: string
  name: string
  image_url: string
  owner: JsonUserStub | null
  created_at: number
  updated_at: number
}

export interface JsonUserStub {
  username: string
  avatar_url: string | null
}

export interface JsonUser extends JsonUserStub {
  id: string
  role: string
  created_at: number
}

export function serializeUserStub(user: Pick<User, 'username' | 'avatar_url'>): JsonUserStub {
  return { username: user.username, avatar_url: user.avatar_url ?? null }
}

export function serializeUser(user: User): JsonUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    avatar_url: user.avatar_url ?? null,
    created_at: user.created_at,
  }
}

export function serializeSticker(
  sticker: Sticker,
  owner: Pick<User, 'username' | 'avatar_url'> | null,
): JsonSticker {
  return {
    id: sticker.id,
    name: sticker.name,
    image_url: sticker.image_url,
    owner: owner ? serializeUserStub(owner) : null,
    created_at: sticker.created_at,
    updated_at: sticker.updated_at,
  }
}
