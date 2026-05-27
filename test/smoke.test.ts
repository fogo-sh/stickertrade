import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'

import bcrypt from 'bcryptjs'

import { invitations, stickers, users, UserRoles } from '../app/data/schema.ts'
import { routes } from '../app/routes.ts'
import { buildUrl, createTestEnv, fetchCsrf, loginAs, postForm } from './helpers.ts'

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
      const { token, cookie } = await fetchCsrf(env, routes.login.index.href())
      const body = new FormData()
      body.set('_csrf', token)
      body.set('username', 'alice')
      body.set('password', 'wrongpass')
      const res = await postForm(env, routes.login.action.href(), { cookie, body })
      assert.equal(res.status, 400)
      const html = await res.text()
      assert.match(html, /Login failed/)
    } finally {
      env.cleanup()
    }
  })

  it('rejects POST without CSRF token', async () => {
    const env = await createTestEnv()
    try {
      await seedUser(env, 'alice', 'goodpass')
      const body = new FormData()
      body.set('username', 'alice')
      body.set('password', 'goodpass')
      // No _csrf, no Origin header.
      const res = await env.fetch(
        new Request(buildUrl(routes.login.action.href()), { method: 'POST', body }),
      )
      assert.equal(res.status, 403)
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
      const sessionCookie = await loginAs(env, 'bob', 'bobpass')
      const { token, cookie } = await fetchCsrf(env, routes.invitations.index.href(), sessionCookie)
      const body = new FormData()
      body.set('_csrf', token)
      const res = await postForm(env, routes.invitations.generate.href(), { cookie, body })
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

      const { token, cookie } = await fetchCsrf(env, routes.invitation.index.href({ id: invitationId }))
      const body = new FormData()
      body.set('_csrf', token)
      body.set('username', 'newcomer')
      body.set('password', 'newpass1')
      body.set('confirmPassword', 'newpass1')
      const res = await postForm(env, routes.invitation.action.href({ id: invitationId }), {
        cookie,
        body,
      })
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
      // Get a CSRF token from a known-good page since /invitation/:id returns 404 before render.
      const { token, cookie } = await fetchCsrf(env, routes.login.index.href())
      const body = new FormData()
      body.set('_csrf', token)
      body.set('username', 'someone')
      body.set('password', 'somepass1')
      body.set('confirmPassword', 'somepass1')
      const res = await postForm(env, routes.invitation.action.href({ id: 'does-not-exist' }), {
        cookie,
        body,
      })
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

      const sessionCookie = await loginAs(env, 'admin', 'adminpass')
      const { token, cookie } = await fetchCsrf(env, routes.admin.stickers.href(), sessionCookie)
      const body = new FormData()
      body.set('_csrf', token)
      const res = await postForm(env, routes.admin.deleteSticker.href({ id: stickerId }), {
        cookie,
        body,
      })
      assert.equal(res.status, 303)
      const remaining = await env.db.find(stickers, stickerId)
      assert.equal(remaining, null)
    } finally {
      env.cleanup()
    }
  })
})

describe('change password', () => {
  it('rejects wrong current password', async () => {
    const env = await createTestEnv()
    try {
      await seedUser(env, 'carol', 'currentpass')
      const sessionCookie = await loginAs(env, 'carol', 'currentpass')
      const { token, cookie } = await fetchCsrf(env, routes.editProfile.index.href(), sessionCookie)
      const body = new FormData()
      body.set('_csrf', token)
      body.set('currentPassword', 'wrongpass')
      body.set('newPassword', 'newpassword123')
      body.set('confirmPassword', 'newpassword123')
      const res = await postForm(env, routes.changePassword.action.href(), { cookie, body })
      assert.equal(res.status, 400)
      assert.match(await res.text(), /Current password is incorrect/)
    } finally {
      env.cleanup()
    }
  })

  it('updates password and lets the user log in with the new one', async () => {
    const env = await createTestEnv()
    try {
      await seedUser(env, 'dan', 'oldpass1')
      const sessionCookie = await loginAs(env, 'dan', 'oldpass1')
      const { token, cookie } = await fetchCsrf(env, routes.editProfile.index.href(), sessionCookie)
      const body = new FormData()
      body.set('_csrf', token)
      body.set('currentPassword', 'oldpass1')
      body.set('newPassword', 'brand_new_pw')
      body.set('confirmPassword', 'brand_new_pw')
      const res = await postForm(env, routes.changePassword.action.href(), { cookie, body })
      assert.equal(res.status, 303)
      assert.equal(res.headers.get('location'), routes.editProfile.index.href())

      // Old password should no longer work
      const oldLoginAttempt = fetchCsrf(env, routes.login.index.href()).then(({ token: t, cookie: c }) => {
        const oldBody = new FormData()
        oldBody.set('_csrf', t)
        oldBody.set('username', 'dan')
        oldBody.set('password', 'oldpass1')
        return postForm(env, routes.login.action.href(), { cookie: c, body: oldBody })
      })
      const oldLogin = await oldLoginAttempt
      assert.equal(oldLogin.status, 400)

      // New password works
      const newCookie = await loginAs(env, 'dan', 'brand_new_pw')
      assert.ok(newCookie)
    } finally {
      env.cleanup()
    }
  })
})

describe('edit profile', () => {
  it('updates the avatar_url for the current user', async () => {
    const env = await createTestEnv()
    try {
      const userId = await seedUser(env, 'eve', 'evepass')
      const sessionCookie = await loginAs(env, 'eve', 'evepass')
      const { token, cookie } = await fetchCsrf(env, routes.editProfile.index.href(), sessionCookie)

      // Tiny valid PNG generated by sharp.
      const sharp = (await import('sharp')).default
      const png = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 64, b: 200 } },
      })
        .png()
        .toBuffer()
      const view = new Uint8Array(new ArrayBuffer(png.byteLength))
      view.set(png)
      const file = new File([view], 'avatar.png', { type: 'image/png' })

      const body = new FormData()
      body.set('_csrf', token)
      body.set('avatar', file)
      const res = await postForm(env, routes.editProfile.action.href(), { cookie, body })
      assert.equal(res.status, 303)
      assert.equal(res.headers.get('location'), routes.editProfile.index.href())

      const updated = await env.db.findOne(users, { where: { id: userId } })
      assert.ok(updated)
      assert.match(updated.avatar_url ?? '', /^\/uploads\/avatars\//)
    } finally {
      env.cleanup()
    }
  })

  it('clears the avatar when remove-avatar is submitted', async () => {
    const env = await createTestEnv()
    try {
      const userId = await seedUser(env, 'frank', 'frankpass')
      // Pre-set an avatar_url directly in the db.
      await env.db.update(users, userId, { avatar_url: '/uploads/avatars/existing.png' })
      const sessionCookie = await loginAs(env, 'frank', 'frankpass')
      const { token, cookie } = await fetchCsrf(env, routes.editProfile.index.href(), sessionCookie)

      const body = new FormData()
      body.set('_csrf', token)
      body.set('action', 'remove-avatar')
      const res = await postForm(env, routes.editProfile.action.href(), { cookie, body })
      assert.equal(res.status, 303)

      const updated = await env.db.findOne(users, { where: { id: userId } })
      assert.ok(updated)
      assert.equal(updated.avatar_url, null)
    } finally {
      env.cleanup()
    }
  })
})

describe('edit sticker', () => {
  it('lets the owner rename a sticker', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'grace', 'gracepass')
      const stickerId = randomUUID()
      await env.db.create(stickers, {
        id: stickerId,
        name: 'old name',
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const sessionCookie = await loginAs(env, 'grace', 'gracepass')
      const { token, cookie } = await fetchCsrf(
        env,
        routes.editSticker.index.href({ id: stickerId }),
        sessionCookie,
      )
      const body = new FormData()
      body.set('_csrf', token)
      body.set('name', 'new shiny name')
      const res = await postForm(env, routes.editSticker.action.href({ id: stickerId }), {
        cookie,
        body,
      })
      assert.equal(res.status, 303)
      assert.equal(res.headers.get('location'), routes.sticker.href({ id: stickerId }))

      const updated = await env.db.findOne(stickers, { where: { id: stickerId } })
      assert.ok(updated)
      assert.equal(updated.name, 'new shiny name')
    } finally {
      env.cleanup()
    }
  })

  it('refuses edits by non-owner non-admin users', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'henry', 'henrypass')
      await seedUser(env, 'intruder', 'intruderpass')
      const stickerId = randomUUID()
      await env.db.create(stickers, {
        id: stickerId,
        name: 'mine',
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const sessionCookie = await loginAs(env, 'intruder', 'intruderpass')
      // Intruder can't reach the edit page either.
      const get = await env.fetch(
        new Request(buildUrl(routes.editSticker.index.href({ id: stickerId })), {
          headers: { cookie: sessionCookie },
        }),
      )
      assert.equal(get.status, 403)
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
