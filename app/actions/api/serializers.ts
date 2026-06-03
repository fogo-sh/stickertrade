import type { Sticker, Surface, SurfaceImage, User } from '../../data/schema.ts'

export interface JsonSticker {
  id: string
  name: string
  slug: string
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
    slug: sticker.slug,
    image_url: sticker.image_url,
    owner: owner ? serializeUserStub(owner) : null,
    created_at: sticker.created_at,
    updated_at: sticker.updated_at,
  }
}

export interface JsonSurfaceImage {
  id: string
  image_url: string
  is_primary: boolean
}

export interface JsonSurface {
  id: string
  name: string
  slug: string
  description: string | null
  images: JsonSurfaceImage[]
  owner: JsonUserStub
  created_at: number
  updated_at: number
}

export function serializeSurfaceImage(img: SurfaceImage): JsonSurfaceImage {
  return {
    id: img.id,
    image_url: img.image_url,
    is_primary: Boolean(img.is_primary),
  }
}

export function serializeSurface(
  surface: Surface,
  images: SurfaceImage[],
  owner: Pick<User, 'username' | 'avatar_url'>,
): JsonSurface {
  // Sort primary first, then by created_at asc so tied non-primary
  // images come back in upload order.
  const sorted = [...images].sort((a, b) => {
    const aPrimary = Boolean(a.is_primary)
    const bPrimary = Boolean(b.is_primary)
    if (aPrimary !== bPrimary) return aPrimary ? -1 : 1
    return a.created_at - b.created_at
  })
  return {
    id: surface.id,
    name: surface.name,
    slug: surface.slug,
    description: surface.description,
    images: sorted.map(serializeSurfaceImage),
    owner: serializeUserStub(owner),
    created_at: surface.created_at,
    updated_at: surface.updated_at,
  }
}
