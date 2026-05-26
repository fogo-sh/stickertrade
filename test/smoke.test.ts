import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'

import bcrypt from 'bcryptjs'

import { invitations, stickers, users, UserRoles } from '../app/data/schema.ts'
import { routes } from '../app/routes.ts'
import { buildUrl, createTestEnv, loginAs } from './helpers.ts'

async function seedUser(
  env: Awaited<ReturnType<typeof createTestEnv>>,
  username: string,
  password: string,
  role: string = UserRoles.User,
): Promise<string> {
  const id = randomUUID()
  const now = Date.now()
  await env.db.create(users, {
    id,
    username,
    role,
    password_hash: await bcrypt.hash(password, 10),
    invitation_limit: 10,
    created_at: now,
    updated_at: now,
  })
  return id
}

describe('home page', () => {
  it('renders 200 with empty data', async () => {
    const env = await createTestEnv()
    try {
      const res = await env.fetch(new Request(buildUrl(routes.home.href())))
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /stickertrade/)
      assert.match(html, /recently posted stickers/)
    } finally {
      env.cleanup()
    }
  })
})

describe('login', () => {
  it('rejects bad credentials', async () => {
    const env = await createTestEnv()
    try {
      await seedUser(env, 'alice', 'goodpass')
      const body = new FormData()
      body.set('username', 'alice')
      body.set('password', 'wrongpass')
      const res = await env.fetch(
        new Request(buildUrl(routes.login.action.href()), { method: 'POST', body }),
      )
      assert.equal(res.status, 400)
      const html = await res.text()
      assert.match(html, /Login failed/)
    } finally {
      env.cleanup()
    }
  })

  it('accepts valid credentials and redirects home', async () => {
    const env = await createTestEnv()
    try {
      await seedUser(env, 'alice', 'goodpass')
      const cookie = await loginAs(env, 'alice', 'goodpass')
      assert.ok(cookie.startsWith('stickertrade_test_session='))

      // Visit home with the cookie - should still 200.
      const res = await env.fetch(
        new Request(buildUrl(routes.home.href()), { headers: { cookie } }),
      )
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /alice/)
      assert.match(html, /logout/)
    } finally {
      env.cleanup()
    }
  })
})

describe('invitations', () => {
  it('allows a logged-in user to generate an invitation', async () => {
    const env = await createTestEnv()
    try {
      await seedUser(env, 'bob', 'bobpass')
      const cookie = await loginAs(env, 'bob', 'bobpass')

      const res = await env.fetch(
        new Request(buildUrl(routes.invitations.generate.href()), {
          method: 'POST',
          headers: { cookie },
        }),
      )
      assert.equal(res.status, 303)
      assert.equal(res.headers.get('location'), routes.invitations.index.href())

      const count = await env.db.count(invitations)
      assert.equal(count, 1)
    } finally {
      env.cleanup()
    }
  })

  it('lets an invited user accept by creating an account', async () => {
    const env = await createTestEnv()
    try {
      const inviterId = await seedUser(env, 'inviter', 'inviterpass')
      const invitationId = randomUUID()
      await env.db.create(invitations, {
        id: invitationId,
        from_id: inviterId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const body = new FormData()
      body.set('username', 'newcomer')
      body.set('password', 'newpass1')
      body.set('confirmPassword', 'newpass1')
      const res = await env.fetch(
        new Request(buildUrl(routes.invitation.action.href({ id: invitationId })), {
          method: 'POST',
          body,
        }),
      )
      assert.equal(res.status, 303)
      assert.equal(res.headers.get('location'), routes.profile.href({ username: 'newcomer' }))

      const newUser = await env.db.findOne(users, { where: { username: 'newcomer' } })
      assert.ok(newUser, 'newcomer should be created')
      assert.equal(newUser.invitation_id, invitationId)
    } finally {
      env.cleanup()
    }
  })

  it('rejects accepting a non-existent invitation', async () => {
    const env = await createTestEnv()
    try {
      const body = new FormData()
      body.set('username', 'someone')
      body.set('password', 'somepass')
      body.set('confirmPassword', 'somepass')
      const res = await env.fetch(
        new Request(buildUrl(routes.invitation.action.href({ id: 'does-not-exist' })), {
          method: 'POST',
          body,
        }),
      )
      assert.equal(res.status, 404)
    } finally {
      env.cleanup()
    }
  })
})

describe('admin', () => {
  it('forbids non-admin from admin/users', async () => {
    const env = await createTestEnv()
    try {
      await seedUser(env, 'normal', 'normalpass')
      const cookie = await loginAs(env, 'normal', 'normalpass')
      const res = await env.fetch(
        new Request(buildUrl(routes.admin.users.href()), { headers: { cookie } }),
      )
      assert.equal(res.status, 403)
    } finally {
      env.cleanup()
    }
  })

  it('lets admin delete a sticker', async () => {
    const env = await createTestEnv()
    try {
      await seedUser(env, 'admin', 'adminpass', UserRoles.Admin)
      const aliceId = await seedUser(env, 'alice', 'alicepass')

      const stickerId = randomUUID()
      await env.db.create(stickers, {
        id: stickerId,
        name: 'soon-gone',
        image_url: '/images/banner.png',
        owner_id: aliceId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const cookie = await loginAs(env, 'admin', 'adminpass')
      const res = await env.fetch(
        new Request(buildUrl(routes.admin.deleteSticker.href({ id: stickerId })), {
          method: 'POST',
          headers: { cookie },
        }),
      )
      assert.equal(res.status, 303)
      const remaining = await env.db.find(stickers, stickerId)
      assert.equal(remaining, null)
    } finally {
      env.cleanup()
    }
  })
})

describe('dev logs', () => {
  it('renders the dev logs index', async () => {
    const env = await createTestEnv()
    try {
      const res = await env.fetch(new Request(buildUrl(routes.devLogsIndex.href())))
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /dev logs/)
    } finally {
      env.cleanup()
    }
  })

  it('serves an rss feed', async () => {
    const env = await createTestEnv()
    try {
      const res = await env.fetch(new Request(buildUrl(routes.devLogsRss.href())))
      assert.equal(res.status, 200)
      assert.match(res.headers.get('content-type') ?? '', /rss/)
      const body = await res.text()
      assert.match(body, /<rss/)
    } finally {
      env.cleanup()
    }
  })
})
