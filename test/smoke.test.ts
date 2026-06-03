import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'

import bcrypt from 'bcryptjs'

import { invitations, stickers, users, UserRoles } from '../app/data/schema.ts'
import { routes } from '../app/routes.ts'
import {
  buildUrl,
  createTestEnv,
  fetchCsrf,
  loginAs,
  postForm,
  postMultipart,
} from './helpers.ts'

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
      // No _csrf token, no Origin header. URL-encoded body so CSRF middleware
      // actually runs (multipart bodies are handled by upload controllers).
      const res = await env.fetch(
        new Request(buildUrl(routes.login.action.href()), {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'username=alice&password=goodpass',
        }),
      )
      assert.equal(res.status, 403)
    } finally {
      env.cleanup()
    }
  })

  it('rejects POST whose Origin header does not match request URL (proxy scenario)', async () => {
    // Default CSRF behaviour: configured origin = undefined, so the middleware
    // compares Origin against context.url.origin. Behind a TLS-terminating
    // proxy these differ and CSRF rejects with 'invalid CSRF origin'.
    const env = await createTestEnv()
    try {
      await seedUser(env, 'alice', 'goodpass')
      const res = await env.fetch(
        new Request(buildUrl(routes.login.action.href()), {
          method: 'POST',
          headers: {
            origin: 'https://stickertrade.ca',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: '',
        }),
      )
      assert.equal(res.status, 403)
      const body = await res.text()
      assert.match(body, /invalid CSRF origin/)
    } finally {
      env.cleanup()
    }
  })

  it('PUBLIC_ORIGIN config lets a proxied request pass the origin check', async () => {
    // Same as above but with publicOrigin configured. We still expect a 403
    // (no _csrf token), but it should be a missing-token rejection, not an
    // origin rejection — proving the origin check now accepts the proxied
    // browser request.
    const env = await createTestEnv({ publicOrigin: 'https://stickertrade.ca' })
    try {
      await seedUser(env, 'alice', 'goodpass')
      const res = await env.fetch(
        new Request(buildUrl(routes.login.action.href()), {
          method: 'POST',
          headers: {
            origin: 'https://stickertrade.ca',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: '',
        }),
      )
      assert.equal(res.status, 403)
      const body = await res.text()
      assert.match(body, /missing CSRF token/)
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
      const res = await postMultipart(env, routes.editProfile.action.href(), { cookie, body })
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

describe('api tokens', () => {
  it('creates a token and lets it authenticate api requests', async () => {
    const env = await createTestEnv()
    try {
      const userId = await seedUser(env, 'ivy', 'ivypass')
      const sessionCookie = await loginAs(env, 'ivy', 'ivypass')

      // Create a token via the HTML form.
      const { token: csrfToken, cookie } = await fetchCsrf(
        env,
        routes.editProfile.index.href(),
        sessionCookie,
      )
      const body = new FormData()
      body.set('_csrf', csrfToken)
      body.set('name', 'test token')
      const res = await postForm(env, routes.createApiToken.href(), { cookie, body })
      assert.equal(res.status, 303)

      // Read the flash to recover the plaintext token.
      const reload = await env.fetch(
        new Request(buildUrl(routes.editProfile.index.href()), {
          headers: { cookie: res.headers.get('set-cookie')?.split(';')[0] ?? cookie },
        }),
      )
      const html = await reload.text()
      const match = html.match(/(st_[0-9a-f]{48})/)
      assert.ok(match, 'plaintext token should appear in the response once')
      const plaintext = match[1]!

      // Now hit a write-protected API endpoint with the bearer token.
      const apiRes = await env.fetch(
        new Request(buildUrl(routes.api.me.href()), {
          headers: { authorization: `Bearer ${plaintext}` },
        }),
      )
      assert.equal(apiRes.status, 200)
      const payload = (await apiRes.json()) as { user: { username: string; id: string } }
      assert.equal(payload.user.username, 'ivy')
      assert.equal(payload.user.id, userId)
    } finally {
      env.cleanup()
    }
  })

  it('revoked tokens stop authenticating', async () => {
    const env = await createTestEnv()
    try {
      const userId = await seedUser(env, 'jess', 'jesspass')

      // Create a token directly via the data helper.
      const { createTokenForUser } = await import('../app/data/api-tokens.ts')
      const { plaintext, id: tokenId } = await createTokenForUser(env.db, { id: userId }, 'tok')

      // Sanity: bearer works.
      const ok = await env.fetch(
        new Request(buildUrl(routes.api.me.href()), {
          headers: { authorization: `Bearer ${plaintext}` },
        }),
      )
      assert.equal(ok.status, 200)

      // Revoke via the HTML form.
      const sessionCookie = await loginAs(env, 'jess', 'jesspass')
      const { token: csrfToken, cookie } = await fetchCsrf(
        env,
        routes.editProfile.index.href(),
        sessionCookie,
      )
      const body = new FormData()
      body.set('_csrf', csrfToken)
      const revoke = await postForm(env, routes.revokeApiToken.href({ id: tokenId }), {
        cookie,
        body,
      })
      assert.equal(revoke.status, 303)

      // Bearer is now rejected.
      const denied = await env.fetch(
        new Request(buildUrl(routes.api.me.href()), {
          headers: { authorization: `Bearer ${plaintext}` },
        }),
      )
      assert.equal(denied.status, 401)
    } finally {
      env.cleanup()
    }
  })
})

describe('api: stickers', () => {
  it('GET /api/stickers returns public list without auth', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'kelly', 'kellypass')
      const stickerId = randomUUID()
      await env.db.create(stickers, {
        id: stickerId,
        name: 'public sticker',
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(new Request(buildUrl(routes.api.stickersIndex.href())))
      assert.equal(res.status, 200)
      const payload = (await res.json()) as { stickers: Array<{ id: string; name: string }> }
      assert.ok(Array.isArray(payload.stickers))
      assert.equal(payload.stickers[0]?.name, 'public sticker')
    } finally {
      env.cleanup()
    }
  })

  it('GET /api/stickers/:id 404s a missing one', async () => {
    const env = await createTestEnv()
    try {
      const res = await env.fetch(
        new Request(buildUrl(routes.api.stickerShow.href({ id: 'missing' }))),
      )
      assert.equal(res.status, 404)
      const payload = (await res.json()) as { error: string }
      assert.equal(payload.error, 'Not Found')
    } finally {
      env.cleanup()
    }
  })

  it('GET /api/nonsense returns a JSON 404, not plaintext', async () => {
    const env = await createTestEnv()
    try {
      const res = await env.fetch(new Request(buildUrl('/api/nonsense/path')))
      assert.equal(res.status, 404)
      assert.match(res.headers.get('content-type') ?? '', /application\/json/)
      const payload = (await res.json()) as { error: string }
      assert.equal(payload.error, 'Not Found')
    } finally {
      env.cleanup()
    }
  })

  it('POST /api/stickers requires bearer auth', async () => {
    const env = await createTestEnv()
    try {
      const body = new FormData()
      body.set('name', 'not gonna work')
      const res = await env.fetch(
        new Request(buildUrl(routes.api.stickerCreate.href()), { method: 'POST', body }),
      )
      assert.equal(res.status, 401)
    } finally {
      env.cleanup()
    }
  })

  it('POST /api/stickers creates a sticker with bearer auth', async () => {
    const env = await createTestEnv()
    try {
      const userId = await seedUser(env, 'liam', 'liampass')
      const { createTokenForUser } = await import('../app/data/api-tokens.ts')
      const { plaintext } = await createTokenForUser(env.db, { id: userId }, 'tok')

      // Build a tiny PNG.
      const sharp = (await import('sharp')).default
      const png = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 100 } },
      })
        .png()
        .toBuffer()
      const view = new Uint8Array(new ArrayBuffer(png.byteLength))
      view.set(png)
      const file = new File([view], 'sticker.png', { type: 'image/png' })

      const body = new FormData()
      body.set('name', 'api created')
      body.set('image', file)

      const res = await env.fetch(
        new Request(buildUrl(routes.api.stickerCreate.href()), {
          method: 'POST',
          headers: { authorization: `Bearer ${plaintext}` },
          body,
        }),
      )
      assert.equal(res.status, 201)
      const payload = (await res.json()) as {
        sticker: { id: string; name: string; owner: { username: string } | null }
      }
      assert.equal(payload.sticker.name, 'api created')
      assert.equal(payload.sticker.owner?.username, 'liam')
    } finally {
      env.cleanup()
    }
  })

  it('POST /api/stickers rejects oversized files with a tagged JSON error', async () => {
    const env = await createTestEnv()
    try {
      const userId = await seedUser(env, 'libby', 'libbypass')
      const { createTokenForUser } = await import('../app/data/api-tokens.ts')
      const { plaintext } = await createTokenForUser(env.db, { id: userId }, 'tok')

      // 11 MiB payload — exceeds the 10 MiB limit.
      const huge = new Uint8Array(11 * 1024 * 1024)
      const file = new File([huge], 'huge.png', { type: 'image/png' })

      const body = new FormData()
      body.set('name', 'too big')
      body.set('image', file)

      const res = await env.fetch(
        new Request(buildUrl(routes.api.stickerCreate.href()), {
          method: 'POST',
          headers: { authorization: `Bearer ${plaintext}` },
          body,
        }),
      )
      assert.equal(res.status, 413)
      const payload = (await res.json()) as {
        error: string
        message: string
        max_bytes: number
      }
      assert.equal(payload.error, 'file_too_large')
      assert.match(payload.message, /max .* MiB/)
      assert.equal(payload.max_bytes, 10 * 1024 * 1024)
    } finally {
      env.cleanup()
    }
  })

  it('POST /api/stickers rejects unsupported image types', async () => {
    const env = await createTestEnv()
    try {
      const userId = await seedUser(env, 'lana', 'lanapass')
      const { createTokenForUser } = await import('../app/data/api-tokens.ts')
      const { plaintext } = await createTokenForUser(env.db, { id: userId }, 'tok')

      // A small file with a bogus type.
      const small = new Uint8Array(100)
      const file = new File([small], 'evil.gif', { type: 'image/gif' })

      const body = new FormData()
      body.set('name', 'no gifs')
      body.set('image', file)

      const res = await env.fetch(
        new Request(buildUrl(routes.api.stickerCreate.href()), {
          method: 'POST',
          headers: { authorization: `Bearer ${plaintext}` },
          body,
        }),
      )
      assert.equal(res.status, 400)
      const payload = (await res.json()) as { error: string; message: string }
      assert.equal(payload.error, 'unsupported_image_type')
      assert.match(payload.message, /png or jpeg/i)
    } finally {
      env.cleanup()
    }
  })

  it('PATCH /api/stickers/:id renames when owned', async () => {
    const env = await createTestEnv()
    try {
      const userId = await seedUser(env, 'mary', 'marypass')
      const { createTokenForUser } = await import('../app/data/api-tokens.ts')
      const { plaintext } = await createTokenForUser(env.db, { id: userId }, 'tok')
      const stickerId = randomUUID()
      await env.db.create(stickers, {
        id: stickerId,
        name: 'old',
        image_url: '/images/banner.png',
        owner_id: userId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(
        new Request(buildUrl(routes.api.stickerUpdate.href({ id: stickerId })), {
          method: 'PATCH',
          headers: {
            authorization: `Bearer ${plaintext}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: 'new' }),
        }),
      )
      assert.equal(res.status, 200)
      const payload = (await res.json()) as { sticker: { name: string } }
      assert.equal(payload.sticker.name, 'new')
    } finally {
      env.cleanup()
    }
  })

  it('PATCH /api/stickers/:id forbids non-owner', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'nate', 'natepass')
      const otherId = await seedUser(env, 'oscar', 'oscarpass')
      const { createTokenForUser } = await import('../app/data/api-tokens.ts')
      const { plaintext } = await createTokenForUser(env.db, { id: otherId }, 'tok')
      const stickerId = randomUUID()
      await env.db.create(stickers, {
        id: stickerId,
        name: 'natefoo',
        image_url: '/images/banner.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(
        new Request(buildUrl(routes.api.stickerUpdate.href({ id: stickerId })), {
          method: 'PATCH',
          headers: {
            authorization: `Bearer ${plaintext}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: 'taken over' }),
        }),
      )
      assert.equal(res.status, 403)
    } finally {
      env.cleanup()
    }
  })

  it('DELETE /api/stickers/:id deletes when owned', async () => {
    const env = await createTestEnv()
    try {
      const userId = await seedUser(env, 'piper', 'piperpass')
      const { createTokenForUser } = await import('../app/data/api-tokens.ts')
      const { plaintext } = await createTokenForUser(env.db, { id: userId }, 'tok')
      const stickerId = randomUUID()
      await env.db.create(stickers, {
        id: stickerId,
        name: 'going away',
        image_url: '/images/banner.png',
        owner_id: userId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(
        new Request(buildUrl(routes.api.stickerDestroy.href({ id: stickerId })), {
          method: 'DELETE',
          headers: { authorization: `Bearer ${plaintext}` },
        }),
      )
      assert.equal(res.status, 204)
      const remaining = await env.db.find(stickers, stickerId)
      assert.equal(remaining, null)
    } finally {
      env.cleanup()
    }
  })

  it('GET /api/users/:username and /stickers return public data', async () => {
    const env = await createTestEnv()
    try {
      const userId = await seedUser(env, 'quincy', 'quincypass')
      await env.db.create(stickers, {
        id: randomUUID(),
        name: 'q1',
        image_url: '/images/banner.png',
        owner_id: userId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const userRes = await env.fetch(
        new Request(buildUrl(routes.api.userShow.href({ username: 'quincy' }))),
      )
      assert.equal(userRes.status, 200)
      const userPayload = (await userRes.json()) as { user: { username: string } }
      assert.equal(userPayload.user.username, 'quincy')

      const stickersRes = await env.fetch(
        new Request(buildUrl(routes.api.userStickers.href({ username: 'quincy' }))),
      )
      assert.equal(stickersRes.status, 200)
      const stickersPayload = (await stickersRes.json()) as {
        stickers: Array<{ name: string }>
      }
      assert.equal(stickersPayload.stickers[0]?.name, 'q1')
    } finally {
      env.cleanup()
    }
  })
})

describe('upload errors (html form)', () => {
  it('POST /upload-sticker rejects oversized files with a friendly message', async () => {
    const env = await createTestEnv()
    try {
      await seedUser(env, 'wendy', 'wendypass')
      const sessionCookie = await loginAs(env, 'wendy', 'wendypass')
      const { token, cookie } = await fetchCsrf(
        env,
        routes.uploadSticker.index.href(),
        sessionCookie,
      )

      // 11 MiB payload — over the 10 MiB limit.
      const huge = new Uint8Array(11 * 1024 * 1024)
      const file = new File([huge], 'huge.png', { type: 'image/png' })

      const body = new FormData()
      body.set('_csrf', token)
      body.set('name', 'too big')
      body.set('image', file)

      const res = await postMultipart(env, routes.uploadSticker.action.href(), { cookie, body })
      assert.equal(res.status, 413)
      const html = await res.text()
      assert.match(html, /max .* MiB/)
    } finally {
      env.cleanup()
    }
  })
})

describe('og tags', () => {
  it('home page emits site-level og:image and og:title', async () => {
    const env = await createTestEnv()
    try {
      const res = await env.fetch(new Request(buildUrl(routes.home.href())))
      const html = await res.text()
      assert.match(html, /<meta property="og:title" content="stickertrade"/)
      assert.match(html, /<meta property="og:image" content="http:\/\/localhost(:\d+)?\/images\/banner\.png"/)
      assert.match(html, /<meta name="twitter:card" content="summary_large_image"/)
    } finally {
      env.cleanup()
    }
  })

  it('sticker page emits per-sticker og:title + og:image (absolute)', async () => {
    const env = await createTestEnv()
    try {
      const ownerId = await seedUser(env, 'roxie', 'roxiepass')
      const stickerId = randomUUID()
      await env.db.create(stickers, {
        id: stickerId,
        name: 'cool og sticker',
        image_url: '/uploads/stickers/cool.png',
        owner_id: ownerId,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const res = await env.fetch(new Request(buildUrl(routes.sticker.href({ id: stickerId }))))
      const html = await res.text()
      assert.match(html, /<meta property="og:title" content="cool og sticker"/)
      assert.match(html, /<meta property="og:image" content="http:\/\/localhost(:\d+)?\/uploads\/stickers\/cool\.png"/)
      assert.match(html, /<meta property="og:description" content="sticker by roxie"/)
      assert.match(html, /<meta property="og:type" content="article"/)
    } finally {
      env.cleanup()
    }
  })

  it('profile page emits per-profile og:title + og:image', async () => {
    const env = await createTestEnv()
    try {
      const userId = await seedUser(env, 'sami', 'samipass')
      await env.db.update(users, userId, { avatar_url: '/uploads/avatars/sami.png' })
      const res = await env.fetch(
        new Request(buildUrl(routes.profile.href({ username: 'sami' }))),
      )
      const html = await res.text()
      assert.match(html, /<meta property="og:title" content="sami on stickertrade"/)
      assert.match(html, /<meta property="og:image" content="http:\/\/localhost(:\d+)?\/uploads\/avatars\/sami\.png"/)
      assert.match(html, /<meta property="og:type" content="profile"/)
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
