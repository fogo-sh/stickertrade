import * as s from 'remix/data-schema'
import { Database } from 'remix/data-table'
import { inList } from 'remix/data-table/operators'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { assetServer } from '../assets.ts'
import { createTokenForUser } from '../data/api-tokens.ts'
import { getCurrentUser } from '../data/current-user.ts'
import { buildDevLogsFeed } from '../data/dev-logs-feed.ts'
import { getDevLog, getDevLogs } from '../data/dev-logs.ts'
import { roadmapTasks } from '../data/roadmap.ts'
import { apiTokens, stickers, surfaces, users } from '../data/schema.ts'
import { looksLikeUuid } from '../data/slug.ts'
import { uploadStorage } from '../data/uploads.ts'
import { tokenNameSchema } from '../data/validators.ts'
import { routes } from '../routes.ts'
import { BrandPage } from './brand-page.tsx'
import { DevLogPage } from './dev-log-page.tsx'
import { DevLogsIndexPage } from './dev-logs-index-page.tsx'
import { HomePage } from './home-page.tsx'
import { ProfilePage } from './profile-page.tsx'
import { RoadmapPage } from './roadmap-page.tsx'
import { StickerPage } from './sticker-page.tsx'
import { StickersPage } from './stickers-page.tsx'
import { SurfacePage } from './surface-page.tsx'
import { SurfacesPage } from './surfaces-page.tsx'
import { UsersPage } from './users-page.tsx'

function notFound(): Response {
  return new Response('Not Found', { status: 404 })
}

export default createController(routes, {
  actions: {
    // -------- Asset pipeline --------
    async assets(context) {
      return (
        (await assetServer.fetch(context.request)) ?? new Response('Not Found', { status: 404 })
      )
    },

    // -------- User-uploaded files --------
    async uploads(context) {
      const file = await uploadStorage.get(context.params.path)
      if (!file) return notFound()
      return new Response(file.stream(), {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
    },

    // -------- Home --------
    async home(context) {
      const db = context.get(Database)
      const user = getCurrentUser(context)
      const stickerRows = await db.findMany(stickers, {
        orderBy: ['created_at', 'desc'],
        limit: 12,
      })
      const ownerIds = Array.from(
        new Set(stickerRows.map((s) => s.owner_id).filter((id): id is string => !!id)),
      )
      const ownerRows = ownerIds.length
        ? await db.findMany(users, { where: inList('id', ownerIds) })
        : []
      const ownerById = new Map(ownerRows.map((o) => [o.id, o]))

      const userRows = await db.findMany(users, {
        orderBy: ['updated_at', 'desc'],
        limit: 8,
      })

      return context.render(
        <HomePage
          user={user}
          stickers={stickerRows.map((s) => ({
            id: s.id,
            slug: s.slug,
            name: s.name,
            image_url: s.image_url,
            owner: s.owner_id
              ? (() => {
                  const owner = ownerById.get(s.owner_id)
                  if (!owner) return null
                  return { username: owner.username, avatar_url: owner.avatar_url ?? null }
                })()
              : null,
          }))}
          users={userRows.map((u) => ({
            username: u.username,
            avatar_url: u.avatar_url ?? null,
          }))}
        />,
      )
    },

    // -------- Brand --------
    brand(context) {
      return context.render(<BrandPage user={getCurrentUser(context)} />)
    },

    // -------- Roadmap --------
    roadmap(context) {
      return context.render(<RoadmapPage user={getCurrentUser(context)} tasks={roadmapTasks} />)
    },

    // -------- Stickers index --------
    async stickers(context) {
      const db = context.get(Database)
      const rows = await db.findMany(stickers, { orderBy: ['created_at', 'desc'], limit: 1000 })
      const ownerIds = Array.from(
        new Set(rows.map((s) => s.owner_id).filter((id): id is string => !!id)),
      )
      const ownerRows = ownerIds.length
        ? await db.findMany(users, { where: inList('id', ownerIds) })
        : []
      const ownerById = new Map(ownerRows.map((o) => [o.id, o]))

      return context.render(
        <StickersPage
          user={getCurrentUser(context)}
          stickers={rows.map((s) => ({
            id: s.id,
            slug: s.slug,
            name: s.name,
            image_url: s.image_url,
            owner: s.owner_id
              ? (() => {
                  const owner = ownerById.get(s.owner_id)
                  if (!owner) return null
                  return { username: owner.username, avatar_url: owner.avatar_url ?? null }
                })()
              : null,
          }))}
        />,
      )
    },

    // -------- Users index --------
    async users(context) {
      const db = context.get(Database)
      const rows = await db.findMany(users, { orderBy: ['updated_at', 'desc'], limit: 200 })
      return context.render(
        <UsersPage
          user={getCurrentUser(context)}
          users={rows.map((u) => ({ username: u.username, avatar_url: u.avatar_url ?? null }))}
        />,
      )
    },

    // -------- Surfaces index --------
    async surfaces(context) {
      const db = context.get(Database)
      const rows = await db.findMany(surfaces, {
        orderBy: ['created_at', 'desc'],
        limit: 50,
      })
      const ownerIds = Array.from(new Set(rows.map((s) => s.owner_id)))
      const ownerRows = ownerIds.length
        ? await db.findMany(users, { where: inList('id', ownerIds) })
        : []
      const ownerById = new Map(ownerRows.map((u) => [u.id, u]))
      return context.render(
        <SurfacesPage
          user={getCurrentUser(context)}
          surfaces={rows.map((s) => {
            const owner = ownerById.get(s.owner_id)
            return {
              id: s.id,
              slug: s.slug,
              name: s.name,
              description: s.description,
              image_url: s.image_url,
              owner: owner
                ? { username: owner.username, avatar_url: owner.avatar_url ?? null }
                : { username: 'unknown', avatar_url: null },
            }
          })}
        />,
      )
    },

    // -------- Surface show --------
    async surface(context) {
      const db = context.get(Database)
      const param = context.params.slug

      // Backwards compatibility: UUID URLs 301-redirect to the slug URL.
      if (looksLikeUuid(param)) {
        const byId = await db.findOne(surfaces, { where: { id: param } })
        if (!byId) return notFound()
        return redirect(`/surface/${encodeURIComponent(byId.slug)}`, 301)
      }

      const surface = await db.findOne(surfaces, { where: { slug: param } })
      if (!surface) return notFound()
      const owner = await db.findOne(users, { where: { id: surface.owner_id } })
      if (!owner) return notFound() // shouldn't happen due to CASCADE FK
      const currentUser = getCurrentUser(context)
      const canEdit =
        currentUser != null &&
        (currentUser.id === surface.owner_id || currentUser.role === 'ADMIN')
      return context.render(
        <SurfacePage
          user={currentUser}
          surface={{
            id: surface.id,
            slug: surface.slug,
            name: surface.name,
            description: surface.description,
            image_url: surface.image_url,
            owner: { username: owner.username, avatar_url: owner.avatar_url ?? null },
          }}
          canEdit={canEdit}
        />,
      )
    },

    // -------- Sticker show --------
    async sticker(context) {
      const db = context.get(Database)
      const param = context.params.slug

      // Backwards compatibility: old UUID URLs 301-redirect to the slug URL.
      if (looksLikeUuid(param)) {
        const byId = await db.findOne(stickers, { where: { id: param } })
        if (!byId) return notFound()
        return redirect(`/sticker/${encodeURIComponent(byId.slug)}`, 301)
      }

      const sticker = await db.findOne(stickers, { where: { slug: param } })
      if (!sticker) return notFound()
      let owner: { username: string; avatar_url: string | null } | null = null
      if (sticker.owner_id) {
        const row = await db.findOne(users, { where: { id: sticker.owner_id } })
        owner = row ? { username: row.username, avatar_url: row.avatar_url ?? null } : null
      }
      return context.render(
        <StickerPage
          user={getCurrentUser(context)}
          sticker={{
            id: sticker.id,
            slug: sticker.slug,
            name: sticker.name,
            image_url: sticker.image_url,
            owner,
          }}
        />,
      )
    },

    // -------- Profile --------
    async profile(context) {
      const db = context.get(Database)
      const profileUser = await db.findOne(users, {
        where: { username: context.params.username },
      })
      if (!profileUser) return notFound()
      const profileStickers = await db.findMany(stickers, {
        where: { owner_id: profileUser.id },
        orderBy: ['created_at', 'desc'],
      })
      return context.render(
        <ProfilePage
          user={getCurrentUser(context)}
          profile={{
            username: profileUser.username,
            avatar_url: profileUser.avatar_url ?? null,
            stickers: profileStickers.map((s) => ({
              id: s.id,
              slug: s.slug,
              name: s.name,
              image_url: s.image_url,
            })),
          }}
        />,
      )
    },

    // -------- Logout --------
    logout(context) {
      const session = context.get(Session)
      session.unset('auth')
      session.regenerateId(true)
      return redirect(routes.home.href(), 303)
    },

    // -------- API token management (HTML forms, not API endpoints) --------
    async createApiToken(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)
      const formData = context.get(FormData)
      const session = context.get(Session)
      const parsed = s.parseSafe(tokenNameSchema, formData.get('name'))
      if (!parsed.success) {
        session.flash(
          'token_error_name',
          parsed.issues[0]?.message ?? 'Invalid token name',
        )
        return redirect(routes.editProfile.index.href(), 303)
      }
      const db = context.get(Database)
      const created = await createTokenForUser(db, user, parsed.value)
      session.flash(
        'token_new',
        JSON.stringify({ name: created.name, plaintext: created.plaintext }),
      )
      return redirect(routes.editProfile.index.href(), 303)
    },

    async revokeApiToken(context) {
      const user = getCurrentUser(context)
      if (!user) return redirect(routes.login.index.href(), 303)
      const db = context.get(Database)
      const row = await db.findOne(apiTokens, { where: { id: context.params.id } })
      if (!row || row.user_id !== user.id) {
        // Don't leak whether the id exists.
        return redirect(routes.editProfile.index.href(), 303)
      }
      await db.delete(apiTokens, row.id)
      const session = context.get(Session)
      session.flash('token_flash', `Token "${row.name}" revoked.`)
      return redirect(routes.editProfile.index.href(), 303)
    },

    // -------- Dev logs --------
    devLogsIndex(context) {
      return context.render(
        <DevLogsIndexPage user={getCurrentUser(context)} logs={getDevLogs()} />,
      )
    },
    devLog(context) {
      const log = getDevLog(context.params.slug)
      if (!log) return notFound()
      return context.render(
        <DevLogPage
          user={getCurrentUser(context)}
          log={{
            slug: log.slug,
            title: log.title,
            dateString: log.dateString,
            html: log.html,
          }}
        />,
      )
    },
    devLogsRss(context) {
      const origin = new URL(context.request.url).origin
      return new Response(buildDevLogsFeed(origin).rss2(), {
        headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
      })
    },
    devLogsAtom(context) {
      const origin = new URL(context.request.url).origin
      return new Response(buildDevLogsFeed(origin).atom1(), {
        headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
      })
    },
    devLogsJson(context) {
      const origin = new URL(context.request.url).origin
      return new Response(buildDevLogsFeed(origin).json1(), {
        headers: { 'Content-Type': 'application/feed+json; charset=utf-8' },
      })
    },
  },
})
