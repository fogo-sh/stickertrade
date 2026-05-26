import { del, form, get, post, route } from 'remix/routes'

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

  // Profile page
  profile: '/profile/:username',
  removeSticker: form('/profile/:username/remove-sticker/:stickerId'),

  // Sticker upload (GET form, POST action)
  uploadSticker: form('/upload-sticker'),

  // Auth
  login: form('/login'),
  logout: post('/logout'),

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
})
