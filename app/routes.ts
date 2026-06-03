import { del, form, get, patch, post, route } from 'remix/routes'

export const routes = route({
  // Compiled browser modules.
  assets: get('/assets/*path'),
  // User-uploaded sticker images, served via a resource route.
  uploads: get('/uploads/*path'),

  // Public pages
  home: '/',
  brand: '/brand',
  roadmap: '/roadmap',
  stickers: '/stickers',
  users: '/users',

  // Sticker show page
  sticker: '/sticker/:id',
  editSticker: form('/sticker/:id/edit'),

  // Profile page
  profile: '/profile/:username',
  removeSticker: form('/profile/:username/remove-sticker/:stickerId'),

  // Sticker upload (GET form, POST action)
  uploadSticker: form('/upload-sticker'),

  // Auth + account
  login: form('/login'),
  logout: post('/logout'),
  changePassword: form('/account/password'),
  editProfile: form('/account/profile'),

  // Invitations
  invitations: route('/invitations', {
    index: get('/'),
    generate: post('/generate'),
    destroy: post('/:id/destroy'),
  }),
  invitation: form('/invitation/:id'),

  // Dev logs
  devLogsIndex: get('/dev-logs'),
  devLog: get('/dev-logs/:slug'),
  devLogsRss: get('/dev-logs.rss'),
  devLogsAtom: get('/dev-logs.atom'),
  devLogsJson: get('/dev-logs.json'),

  // Admin
  admin: route('/admin', {
    users: get('/users'),
    deleteUser: post('/users/:id/delete'),
    stickers: get('/stickers'),
    deleteSticker: post('/stickers/:id/delete'),
  }),

  // API token management (HTML pages, not API endpoints).
  createApiToken: post('/account/tokens'),
  revokeApiToken: post('/account/tokens/:id/revoke'),

  // JSON API
  api: route('/api', {
    me: get('/me'),
    stickersIndex: get('/stickers'),
    stickerShow: get('/stickers/:id'),
    stickerCreate: post('/stickers'),
    stickerUpdate: patch('/stickers/:id'),
    stickerDestroy: del('/stickers/:id'),
    userShow: get('/users/:username'),
    userStickers: get('/users/:username/stickers'),
    // Catch-all for any other /api/* URL so unknown endpoints return a
    // JSON 404 instead of the router's plain-text default.
    notFound: '/*path',
  }),
})
