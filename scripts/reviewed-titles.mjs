import { readFileSync } from 'node:fs';
import { moviePreferenceKey } from '../shared/movie.ts';

// Emit SQL only. Applying it to local/remote D1 is a separate, explicit step.
const catalog = JSON.parse(readFileSync(process.argv[2] ?? new URL('../data/movie-titles/2026-09-26.json', import.meta.url), 'utf8'));
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
  if (film.introduction != null && (
      !catalog.introductionReviewedAt ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(catalog.introductionReviewedAt) ||
      !Number.isFinite(Date.parse(catalog.introductionReviewedAt)) ||
      !['ja', 'en'].every((language) => {
        const text = film.introduction[language];
        return typeof text === 'string' && text.trim().length > 0 &&
          text.length <= (language === 'ja' ? 240 : 600) &&
          !/[<>\r\n]/.test(text);
      })
    )) throw new Error(`Invalid introduction: ${film.japaneseTitles[0]}`);
  if (film.synopsis != null) {
    const synopsis = film.synopsis;
    const source = URL.parse(synopsis.sourceUrl);
    if (!source || source.protocol !== 'https:' || source.username || source.password ||
        typeof synopsis.evidence !== 'string' || !synopsis.evidence.trim() ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(synopsis.reviewedAt) ||
        !Number.isFinite(Date.parse(synopsis.reviewedAt)) ||
        new Date(synopsis.reviewedAt).toISOString() !== synopsis.reviewedAt ||
        (synopsis.ja == null && synopsis.en == null) ||
        !['ja', 'en'].every((language) => {
          const text = synopsis[language];
          return text == null || (typeof text === 'string' && text.trim().length > 0 &&
            text.length <= (language === 'ja' ? 600 : 1600) && !/[<>\r\n]/.test(text));
        })) throw new Error(`Invalid synopsis: ${film.japaneseTitles[0]}`);
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
  if (row.introduction) {
    console.log(`INSERT INTO movie_introductions
      (title_key,introduction_ja,introduction_en,evidence,source_url,reviewed_at)
      VALUES (${[key, row.introduction.ja, row.introduction.en, row.evidence, row.sourceUrl, catalog.introductionReviewedAt].map(sql).join(',')})
      ON CONFLICT(title_key) DO UPDATE SET
        introduction_ja=excluded.introduction_ja, introduction_en=excluded.introduction_en,
        evidence=excluded.evidence, source_url=excluded.source_url, reviewed_at=excluded.reviewed_at
      WHERE excluded.reviewed_at > movie_introductions.reviewed_at;`);
  }
  if (row.synopsis) {
    const synopsis = row.synopsis;
    console.log(`INSERT INTO movie_synopses
      (title_key,synopsis_ja,synopsis_en,evidence,source_url,reviewed_at)
      VALUES (${[key, synopsis.ja ?? null, synopsis.en ?? null, synopsis.evidence, synopsis.sourceUrl, synopsis.reviewedAt].map(sql).join(',')})
      ON CONFLICT(title_key) DO UPDATE SET
        synopsis_ja=excluded.synopsis_ja, synopsis_en=excluded.synopsis_en,
        evidence=excluded.evidence, source_url=excluded.source_url, reviewed_at=excluded.reviewed_at
      WHERE excluded.reviewed_at > movie_synopses.reviewed_at;`);
  }
}
console.error(`${rows.size} reviewed movie title keys`);
