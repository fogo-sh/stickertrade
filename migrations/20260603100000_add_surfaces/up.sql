CREATE TABLE surfaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX surfaces_slug_unique ON surfaces(slug);
CREATE INDEX surfaces_owner_id_idx ON surfaces(owner_id);

CREATE TABLE surface_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  surface_id TEXT NOT NULL REFERENCES surfaces(id) ON DELETE CASCADE,
  featured_date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX surface_features_featured_date_unique
  ON surface_features(featured_date);
CREATE INDEX surface_features_surface_id_idx ON surface_features(surface_id);
