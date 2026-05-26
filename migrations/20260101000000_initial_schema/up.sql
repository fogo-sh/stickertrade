CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'USER',
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  invitation_id TEXT,
  invitation_limit INTEGER NOT NULL DEFAULT 10,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX users_username_idx ON users (username);

CREATE TABLE stickers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX stickers_owner_id_idx ON stickers (owner_id);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  from_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX invitations_from_id_idx ON invitations (from_id);

CREATE TABLE config (
  id INTEGER PRIMARY KEY,
  invitations_enabled INTEGER NOT NULL
);
