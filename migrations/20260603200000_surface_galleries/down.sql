-- Restore image_url from each surface's primary image.
ALTER TABLE surfaces ADD COLUMN image_url TEXT;
UPDATE surfaces
SET image_url = (
  SELECT image_url FROM surface_images
  WHERE surface_id = surfaces.id AND is_primary = 1
  LIMIT 1
);

DROP INDEX surface_images_one_primary_per_surface;
DROP INDEX surface_images_surface_id_idx;
DROP TABLE surface_images;
