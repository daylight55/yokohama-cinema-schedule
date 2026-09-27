import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { moviePreferenceKey } from '../shared/movie.ts';
import { creditFailureReason, creditSourceIdentity, researchMovieCredits } from '../shared/movie-credits.ts';

// The checkpoint survives interrupted runs. No same-run retries; failures stop the batch.
const [mode, file, limitArg = '10'] = process.argv.slice(2);
if (!['collect', 'sql'].includes(mode) || !file) throw new Error('Usage: movie-credits.mjs collect|sql CHECKPOINT.json [limit <= 100]');
const catalog = JSON.parse(readFileSync(new URL('../data/movie-titles/2026-09-26.json', import.meta.url), 'utf8'));
const checkpoint = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { lookups: {} };
const lookupKey = (input) => JSON.stringify(creditSourceIdentity(input) ?? { japaneseTitle: input.japaneseTitle, englishTitle: input.englishTitle });
const lookupInput = (film) => ({ japaneseTitle: film.japaneseTitles[0], englishTitle: film.englishTitle, sourceUrl: film.sourceUrl });
if (mode === 'collect') {
  const limit = Number(limitArg);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be 1–100');
  let attempted = 0;
  for (const film of catalog.films) {
    const input = lookupInput(film), key = lookupKey(input), previous = checkpoint.lookups[key];
    if (previous?.status === 'verified' || previous?.attempts >= 5 || previous?.nextAttemptAt > new Date().toISOString()) continue;
    if (attempted >= limit) break;
    const entry = { input, attempts: (previous?.attempts ?? 0) + 1, status: 'unresolved', credits: null,
      nextAttemptAt: new Date(Date.now() + 86_400_000).toISOString(), updatedAt: new Date().toISOString() };
    checkpoint.lookups[key] = entry;
    writeFileSync(file, JSON.stringify(checkpoint, null, 2) + '\n');
    attempted++;
    try {
      entry.credits = await researchMovieCredits(input);
      if (entry.credits) entry.status = 'verified';
      console.error(`${entry.status}: ${input.japaneseTitle}`);
    } catch (error) {
      entry.lastError = creditFailureReason(error);
      console.error(`${entry.lastError}; batch stopped at ${input.japaneseTitle}`);
      break;
    } finally { writeFileSync(file, JSON.stringify(checkpoint, null, 2) + '\n'); }
    await setTimeout(1500);
  }
  console.error(`Attempted ${attempted} lookups; verified ${Object.values(checkpoint.lookups).filter(row => row.status === 'verified').length}`);
} else {
  const quote = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
  const rows = new Map();
  for (const film of catalog.films) {
    const entry = checkpoint.lookups[lookupKey(lookupInput(film))];
    if (!entry) continue;
    if (!['verified', 'unresolved'].includes(entry.status) || !Number.isInteger(entry.attempts) || entry.attempts < 1 || entry.attempts > 5) throw new Error('Invalid checkpoint');
    for (const title of film.japaneseTitles) rows.set(moviePreferenceKey(title), entry);
  }
  console.log('-- API-derived credits. Import reviewed titles first; never overwrite verified/newer records.');
  for (const [key, entry] of rows) {
    console.log(`INSERT INTO movie_credits(title_key,credits_json,status,attempts,next_attempt_at,updated_at)
      SELECT ${[key, entry.credits ? JSON.stringify(entry.credits) : null, entry.status, entry.attempts, entry.nextAttemptAt, entry.updatedAt].map(quote).join(',')}
      WHERE EXISTS (SELECT 1 FROM movie_title_research WHERE title_key=${quote(key)})
      ON CONFLICT(title_key) DO UPDATE SET credits_json=excluded.credits_json,status=excluded.status,
        attempts=MAX(movie_credits.attempts,excluded.attempts),next_attempt_at=excluded.next_attempt_at,updated_at=excluded.updated_at
      WHERE movie_credits.status!='verified' AND excluded.updated_at>movie_credits.updated_at;`);
  }
  console.error(`${rows.size} credit lookup keys`);
}
