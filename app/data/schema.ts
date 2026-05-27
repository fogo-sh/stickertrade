import { column as c, table, type TableRow } from 'remix/data-table'

export const users = table({
  name: 'users',
  columns: {
    id: c.text().primaryKey(),
    username: c.text().notNull().unique(),
    role: c.text().notNull().default('USER'),
    password_hash: c.text().notNull(),
    avatar_url: c.text(),
    invitation_id: c.text(),
    invitation_limit: c.integer().notNull().default(10),
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})

export const stickers = table({
  name: 'stickers',
  columns: {
    id: c.text().primaryKey(),
    name: c.text().notNull(),
    image_url: c.text().notNull(),
    owner_id: c.text(),
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})

export const invitations = table({
  name: 'invitations',
  columns: {
    id: c.text().primaryKey(),
    from_id: c.text(),
    message: c.text(),
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})

export const config = table({
  name: 'config',
  columns: {
    id: c.integer().primaryKey(),
    invitations_enabled: c.boolean().notNull(),
  },
})

export const apiTokens = table({
  name: 'api_tokens',
  columns: {
    id: c.text().primaryKey(),
    user_id: c.text().notNull(),
    name: c.text().notNull(),
    token_hash: c.text().notNull(),
    prefix: c.text().notNull(),
    last_used_at: c.integer(),
    created_at: c.integer().notNull(),
  },
})

export type User = TableRow<typeof users>
export type Sticker = TableRow<typeof stickers>
export type Invitation = TableRow<typeof invitations>
export type Config = TableRow<typeof config>
export type ApiToken = TableRow<typeof apiTokens>

export const UserRoles = {
  User: 'USER',
  Admin: 'ADMIN',
} as const

export type UserRole = (typeof UserRoles)[keyof typeof UserRoles]
