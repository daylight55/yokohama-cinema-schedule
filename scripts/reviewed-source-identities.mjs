import { readFileSync } from "node:fs";
import { movieDisplayTitle } from "../shared/movie.ts";
const path = process.argv[2];
if (!path)
  throw new Error(
    "Usage: node --experimental-strip-types scripts/reviewed-source-identities.mjs catalog.json",
  );
const rows = JSON.parse(readFileSync(path, "utf8"));
if (!Array.isArray(rows) || rows.length > 200)
  throw new Error("Invalid identity catalog");
const origins = {
  "tjoy-yokohama": "t-joy_yokohama",
  "yokohama-burg13": "yokohama_burg13",
};
const seen = new Set();
const sql = (value) => `'${value.replaceAll("'", "''")}'`;
// Validate the whole catalog before emitting any SQL.
for (const row of rows) {
  const identity = `${row.sourceId}|${row.sourceMovieId}`;
  if (
    !Object.hasOwn(origins, row.sourceId) ||
    !/^[CE]\d+$/.test(row.sourceMovieId) ||
    seen.has(identity) ||
    typeof row.observedTitle !== "string" ||
    !row.observedTitle.trim() ||
    typeof row.canonicalTitle !== "string" ||
    !row.canonicalTitle.trim() ||
    movieDisplayTitle(row.canonicalTitle) !== row.canonicalTitle ||
    row.evidenceUrl !==
      `https://tjoy.jp/${origins[row.sourceId]}/cinema_detail/${row.sourceMovieId}` ||
    typeof row.verifiedAt !== "string" ||
    !Number.isFinite(Date.parse(row.verifiedAt))
  ) {
    throw new Error(`Invalid reviewed source identity: ${identity}`);
  }
  seen.add(identity);
}
for (const row of rows) {
  console.log(`INSERT INTO source_movie_identity
(source_id,source_movie_id,observed_title,canonical_title,verification,evidence_url,verified_at)
VALUES (${[row.sourceId, row.sourceMovieId, row.observedTitle, row.canonicalTitle, "official", row.evidenceUrl, row.verifiedAt].map(sql).join(",")})
ON CONFLICT(source_id,source_movie_id) DO UPDATE SET
observed_title=excluded.observed_title,verification=excluded.verification,
evidence_url=excluded.evidence_url,verified_at=excluded.verified_at
WHERE source_movie_identity.canonical_title=excluded.canonical_title
AND excluded.verified_at > source_movie_identity.verified_at;`);
}
console.error(`${rows.length} reviewed source movie identities`);
