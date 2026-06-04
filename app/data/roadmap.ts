import { marked } from 'marked'

import type { RoadmapTask } from '../actions/roadmap-page.tsx'

function md(input: string): string {
  return marked.parse(input.trim(), { async: false }) as string
}

const sourceTasks: Array<Omit<RoadmapTask, 'id'>> = [
  // ---- Recently shipped (kept for transparency) ----
  {
    title: 'Port to Remix 3 ⚛️',
    description: md(`
- [x] Re-wrote the entire site on Remix 3 beta
- [x] Replaced Prisma with remix/data-table + node:sqlite
- [x] Replaced Tailwind with remix/ui css() mixins
- [x] Dropped the Minio sidecar; sticker uploads go to a local fs volume
`),
  },
  {
    title: 'Production deploy 🚢',
    description: md(`
- [x] Multi-stage Dockerfile published to ghcr.io
- [x] node-tsx in-place TS, no separate build step
- [x] Auto-applied migrations on container boot
- [x] Bootstrap-admin CLI for first prod login
`),
  },
  {
    title: 'Admin Page 🤴',
    description: md(`
- [x] Delete users
- [x] Delete stickers
- [x] Refined table plumbing (per-row POST actions, no multi-select modal)
`),
  },
  {
    title: 'Testing 🧪',
    description: md(`
- [x] node --test setup for backend integration testing
- [x] Tested login (good + bad creds, CSRF rejection)
- [x] Tested invitations (generate, accept, reject)
- [x] Tested admin (auth gate, delete sticker)
- [x] Tested edit profile + change password
- [x] Tested edit sticker (owner + non-owner)
- [x] Tested API (bearer auth, public reads, CRUD, ownership)
`),
  },
  {
    title: 'Profile editing 👤',
    description: md(`
- [x] Avatar upload (sharp-resized, center-cropped to 512×512)
- [x] Remove avatar
- [x] Change password (with current-password re-verification)
`),
  },
  {
    title: 'Edit sticker ➕',
    description: md(`
- [x] Rename
- [x] Replace image
- [x] Owner + admin gate
`),
  },
  {
    title: 'Security hardening 🔒',
    description: md(`
- [x] CSRF middleware on every state-changing form
- [x] Session ID rotation on login / logout / password change
- [x] PUBLIC_ORIGIN env var for proxies (TLS terminator behind the app)
- [x] Bcrypt password hashing
`),
  },
  {
    title: 'JSON API 🔌',
    description: md(`
- [x] REST endpoints for stickers (CRUD)
- [x] /api/me, /api/users/:username, /api/users/:username/stickers
- [x] Bearer-token auth, hashed at rest, prefix lookup
- [x] Per-user token management UI on /account/profile
`),
  },
  {
    title: 'Slug URLs for stickers 🐌',
    description: md(`
- [x] Public sticker URLs are now \`/sticker/<name>-<6chars>\` instead of full UUIDs
- [x] Old UUID URLs 301-redirect to the new slug URL
- [x] JSON API and admin actions keep UUID params (intentional)
`),
  },
  {
    title: 'Sticker surfaces 🎒',
    description: md(`
- [x] New \`surfaces\` content type — photos of stickered real-world objects
- [x] Profile pages show a user's surfaces below their stickers
- [x] Randomized "Surface of the Day" on the home page (lazy-on-demand, UTC daily)
- [x] Pick history persisted in \`surface_features\` (archive page comes later)
- [x] JSON API endpoints + admin moderation
- [x] Multi-image galleries per surface (up to 8 images; one designated primary)
`),
  },
  {
    title: 'Batch sticker upload 📸',
    description: md(`
- [x] Drop one photo of multiple stickers; we detect each one, remove backgrounds, and upload them in sequence
- [x] Pure-JS bbox detector ported from a Python OpenCV reference
- [x] Background removal via @huggingface/transformers + briaai/RMBG-1.4 (WebGPU with WASM fallback)
- [x] All processing client-side; no new server endpoints
`),
  },

  // ---- Currently in focus ----
  {
    title: 'Opengraph images 🖼️',
    focus: true,
    description: md(`
- [ ] Per-sticker og:image, og:title, og:description
- [ ] Per-profile og:image (avatar), og:title (username)
- [ ] Site-wide defaults
`),
  },

  // ---- Up next ----
  {
    title: 'Stickers index polish 📚',
    description: md(`
- [ ] Pagination (replace the current load-1000 query)
- [ ] Text search by name
- [ ] Filter by owner
`),
  },
  { title: 'Users search 🔎' },
  { title: 'Toasts 🍞' },

  // ---- Future / not yet committed ----
  {
    title: 'Trading 💱 (the actual feature)',
    eventually: true,
    description: md(`
- [ ] Propose a 1-for-1 trade
- [ ] Accept / reject / cancel proposals
- [ ] Trade history / provenance per sticker
`),
  },
  { title: 'Friends 👪', eventually: true },
  {
    title: 'Social associations 🙋‍♂️',
    eventually: true,
    description: md(`
- [ ] Discord login (replaces or supplements invite-only signup?)
- [ ] Twitter/X association (display only)
- [ ] Disassociation
`),
  },
  { title: 'Users rough location 📍', eventually: true },
  {
    title: 'Events 📅',
    eventually: true,
    description: md(`
- [ ] List events
- [ ] Create event
- [ ] Events map
`),
  },
  { title: 'Sticker image cropping 🖼️ (like avatars)', eventually: true },
  {
    title: 'Accessibility audit 🧐',
    eventually: true,
    description: md(`
- [ ] Color contrast review
- [ ] Screen reader review
`),
  },
]

export const roadmapTasks: RoadmapTask[] = sourceTasks.map((task, id) => ({ ...task, id }))
