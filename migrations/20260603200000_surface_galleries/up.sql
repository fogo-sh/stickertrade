CREATE TABLE surface_images (
  id TEXT PRIMARY KEY,
  surface_id TEXT NOT NULL REFERENCES surfaces(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_primary INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX surface_images_surface_id_idx ON surface_images(surface_id);

-- Partial unique index: at most one primary per surface.
CREATE UNIQUE INDEX surface_images_one_primary_per_surface
  ON surface_images(surface_id)
  WHERE is_primary = 1;

-- Backfill: every existing surface's single image becomes its primary.
-- id is a UUID-shaped string matching what randomUUID() produces at runtime
-- (8-4-4-4-12 lowercase hex with the v4 marker).
INSERT INTO surface_images (id, surface_id, image_url, is_primary, created_at)
  SELECT
    lower(
      substr(hex(randomblob(4)), 1, 8) || '-' ||
      substr(hex(randomblob(2)), 1, 4) || '-' ||
      '4' || substr(hex(randomblob(2)), 2, 3) || '-' ||
      substr('89ab', 1 + abs(random() % 4), 1) || substr(hex(randomblob(2)), 2, 3) || '-' ||
      substr(hex(randomblob(6)), 1, 12)
    ),
    id, image_url, 1, created_at
  FROM surfaces;

ALTER TABLE surfaces DROP COLUMN image_url;
