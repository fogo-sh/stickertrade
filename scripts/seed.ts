import { randomUUID } from 'node:crypto'

import bcrypt from 'bcryptjs'

import { db } from '../app/data/db.ts'
import { config, invitations, stickers, users, UserRoles } from '../app/data/schema.ts'
import { generateContentSlug } from '../app/data/slug.ts'

async function upsertConfig() {
  const existing = await db.findOne(config, { where: { id: 1 } })
  if (existing) return
  await db.create(config, { id: 1, invitations_enabled: true })
  console.log('Seeded config row.')
}

async function upsertAdmin(): Promise<string> {
  const existing = await db.findOne(users, { where: { username: 'admin' } })
  if (existing) {
    console.log('Admin user already exists.')
    return existing.id
  }
  const now = Date.now()
  const id = randomUUID()
  await db.create(users, {
    id,
    username: 'admin',
    role: UserRoles.Admin,
    password_hash: await bcrypt.hash('changeme', 10),
    invitation_limit: 100,
    created_at: now,
    updated_at: now,
  })
  console.log('Seeded admin user (username=admin, password=changeme).')
  return id
}

async function maybeSeedSample(adminId: string) {
  const userCount = await db.count(users)
  if (userCount > 1) {
    console.log('Skipping sample seed (users already exist).')
    return
  }

  const now = Date.now()
  const aliceId = randomUUID()
  await db.create(users, {
    id: aliceId,
    username: 'alice',
    role: UserRoles.User,
    password_hash: await bcrypt.hash('alicepass', 10),
    invitation_limit: 10,
    created_at: now,
    updated_at: now,
  })

  await db.create(stickers, {
    id: randomUUID(),
    name: 'sample sticker',
    slug: generateContentSlug('sample sticker'),
    image_url: '/images/banner.png',
    owner_id: aliceId,
    created_at: now,
    updated_at: now,
  })

  await db.create(invitations, {
    id: randomUUID(),
    from_id: adminId,
    message: 'come trade some stickers',
    created_at: now,
    updated_at: now,
  })

  console.log('Seeded sample user (alice / alicepass) + sticker + invitation.')
}

await upsertConfig()
const adminId = await upsertAdmin()
await maybeSeedSample(adminId)
console.log('Seed complete.')
