-- Match both the exact reviewed display title and the existing movie key.
-- This avoids broad/fuzzy title matching (e.g. remakes and multi-part films).
CREATE TABLE IF NOT EXISTS reviewed_movie_images (
  title TEXT PRIMARY KEY,
  movie_key TEXT NOT NULL,
  image_url TEXT NOT NULL CHECK (image_url LIKE 'https://%'),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  reviewed_at TEXT NOT NULL
);

-- Schedule collection replaces rows. Keep reviewed fallbacks across replacements
-- without changing the collector or overriding a real image from a cinema.
CREATE TRIGGER IF NOT EXISTS showings_reviewed_image_insert
AFTER INSERT ON showings
WHEN (NEW.image_url IS NULL OR NEW.image_url = '' OR
      NEW.image_url = 'https://tjoy.jp/img/front/images/no-img.jpg')
  AND EXISTS (
    SELECT 1 FROM reviewed_movie_images
    WHERE title = NEW.title AND movie_key = NEW.movie_key
  )
BEGIN
  UPDATE showings SET image_url = (
    SELECT image_url FROM reviewed_movie_images
    WHERE title = NEW.title AND movie_key = NEW.movie_key
  ) WHERE id = NEW.id;
END;
