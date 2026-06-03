ALTER TABLE stickers ADD COLUMN slug TEXT NOT NULL DEFAULT '';

-- Backfill: lowercase the name, replace common separators with hyphens,
-- trim edge hyphens, append a random 6-char hex suffix.
-- This is the "good enough" SQL version of slugifyName -- it handles
-- common cases (spaces, basic punctuation) but does not strip every
-- non-alphanumeric the way the TS function does. Acceptable: this only
-- runs once against existing rows; new stickers go through the TS helper.
UPDATE stickers
SET slug = trim(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    lower(name),
    ' ', '-'), '_', '-'), '.', '-'), ',', '-'), '!', '-'),
    '?', '-'), ':', '-'), ';', '-'), '/', '-'), '\', '-'),
  '-'
) || '-' || lower(hex(randomblob(3)))
WHERE slug = '';

-- Strip rows that ended up with a leading '-' (name was all separators
-- on the left). The suffix still keeps them unique.
UPDATE stickers SET slug = substr(slug, 2) WHERE slug LIKE '-%';

CREATE UNIQUE INDEX stickers_slug_unique ON stickers(slug);
