import { readFileSync } from 'node:fs';

// Emit reviewable SQL only; database writes require a separate Wrangler command.
const catalog = JSON.parse(readFileSync(new URL('../data/movie-images/2026-09-27.json', import.meta.url), 'utf8'));
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const rows = new Map();
if (!Number.isFinite(Date.parse(catalog.reviewedAt))) throw new Error('Invalid review timestamp');
for (const film of catalog.films) {
  if (!film.movieKey?.trim() || !film.sourceTitle?.trim() || !film.evidence?.trim() ||
      !Array.isArray(film.showingTitles) || !film.showingTitles.length ||
      new URL(film.imageUrl).protocol !== 'https:' || new URL(film.sourceUrl).protocol !== 'https:' ||
      film.imageUrl.includes('no-img')) throw new Error('Invalid reviewed image');
  for (const title of film.showingTitles) {
    if (typeof title !== 'string' || !title.trim() || rows.has(title)) throw new Error('Invalid or duplicate title');
    rows.set(title, [title, film.movieKey, film.imageUrl, film.sourceUrl, catalog.reviewedAt]);
  }
}
console.log('-- Only fill absent images and the known T-Joy placeholder. Preserve all real existing images.');
for (const [, values] of [...rows].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  console.log(`INSERT INTO reviewed_movie_images (title, movie_key, image_url, source_url, reviewed_at)
VALUES (${values.map(quote).join(', ')})
ON CONFLICT(title) DO UPDATE SET movie_key=excluded.movie_key, image_url=excluded.image_url,
source_url=excluded.source_url, reviewed_at=excluded.reviewed_at;`);
}
console.log(`UPDATE showings SET image_url = (
  SELECT image_url FROM reviewed_movie_images r WHERE r.title=showings.title AND r.movie_key=showings.movie_key
) WHERE (image_url IS NULL OR image_url='' OR image_url='https://tjoy.jp/img/front/images/no-img.jpg')
AND EXISTS (SELECT 1 FROM reviewed_movie_images r WHERE r.title=showings.title AND r.movie_key=showings.movie_key);`);
console.error(`${rows.size} reviewed display titles across ${catalog.films.length} movie keys`);
