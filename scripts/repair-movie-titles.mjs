import { readFileSync } from 'node:fs';
import { movieTitleRepairSql } from './lib/movie-title-repair.ts';
if (!process.argv[2]) throw new Error('Usage: node --experimental-strip-types scripts/repair-movie-titles.mjs snapshot.json');
const snapshot = JSON.parse(readFileSync(process.argv[2], 'utf8'));
process.stdout.write(movieTitleRepairSql(snapshot[0].results));
