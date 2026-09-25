import { readFileSync } from 'node:fs';
import { moviePreferenceKey } from '../shared/movie.ts';

// Emit SQL only. Applying it to local/remote D1 is a separate, explicit step.
const catalog = JSON.parse(readFileSync(new URL('../data/movie-titles/2026-09-26.json', import.meta.url), 'utf8'));
const rows = new Map();
const sql = (value) => value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`;
for (const film of catalog.films) {
  if (!Array.isArray(film.japaneseTitles) || !film.japaneseTitles.length ||
      typeof film.englishTitle !== 'string' || !/[A-Za-z]/.test(film.englishTitle) ||
      /[\u3040-\u30ff\u3400-\u9fff]/.test(film.englishTitle) ||
      !['reference', 'official'].includes(film.sourceKind) ||
      !film.evidence?.trim() || new URL(film.sourceUrl).protocol !== 'https:') {
    throw new Error(`Invalid reviewed title: ${JSON.stringify(film.japaneseTitles)}`);
  }
  for (const japaneseTitle of film.japaneseTitles) {
    const key = moviePreferenceKey(japaneseTitle);
    if (!key) throw new Error('Empty movie key');
    const previous = rows.get(key);
    if (previous && previous.englishTitle !== film.englishTitle) {
      throw new Error(`Conflicting titles for ${key}`);
    }
    rows.set(key, { ...film, japaneseTitle });
  }
}
console.log('-- Reviewed public-source titles; preserve existing verified records and research attempts.');
for (const [key, row] of [...rows].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  console.log(`INSERT INTO movie_title_research
    (title_key,japanese_title,english_title,original_title,source_url,source_kind,status,next_attempt_at,updated_at)
    VALUES (${[key, row.japaneseTitle, row.englishTitle, row.originalTitle, row.sourceUrl, row.sourceKind, 'verified', catalog.reviewedAt, catalog.reviewedAt].map(sql).join(',')})
    ON CONFLICT(title_key) DO UPDATE SET
      japanese_title=excluded.japanese_title, english_title=excluded.english_title,
      original_title=excluded.original_title, source_url=excluded.source_url,
      source_kind=excluded.source_kind, entity_id=NULL, status='verified', updated_at=excluded.updated_at
    WHERE movie_title_research.status != 'verified';`);
}
console.error(`${rows.size} reviewed movie title keys`);
