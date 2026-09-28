import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
const catalog = JSON.parse(
  readFileSync("data/source-movie-identities/2026-09-28.json", "utf8"),
);
const sql = (path: string) =>
  execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "scripts/reviewed-source-identities.mjs",
      path,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
it("imports the reviewed official identities idempotently without overwriting newer or different identities", () => {
  const { sqlite } = testDatabase();
  try {
    const query = sql("data/source-movie-identities/2026-09-28.json");
    sqlite.exec(query);
    sqlite.exec(query);
    expect(
      sqlite.prepare("SELECT count(*) n FROM source_movie_identity").get()?.n,
    ).toBe(catalog.length);
    const first = catalog[0];
    sqlite
      .prepare(
        "UPDATE source_movie_identity SET canonical_title='別作品',verified_at='2026-01-01' WHERE source_id=? AND source_movie_id=?",
      )
      .run(first.sourceId, first.sourceMovieId);
    sqlite.exec(query);
    expect(
      sqlite
        .prepare(
          "SELECT canonical_title FROM source_movie_identity WHERE source_id=? AND source_movie_id=?",
        )
        .get(first.sourceId, first.sourceMovieId)?.canonical_title,
    ).toBe("別作品");
  } finally {
    sqlite.close();
  }
});
it("rejects a catalog with a different host or mismatched source ID before emitting any SQL", () => {
  const directory = mkdtempSync(join(tmpdir(), "hama-source-identities-"));
  try {
    const path = join(directory, "invalid.json");
    for (const invalid of [
      { ...catalog[0], evidenceUrl: "https://example.com/detail" },
      { ...catalog[0], sourceMovieId: "../wrong" },
      { ...catalog[0], canonicalTitle: "" },
    ]) {
      writeFileSync(path, JSON.stringify([catalog[0], invalid]));
      try {
        sql(path);
        throw Error("Unexpected success");
      } catch (error) {
        expect((error as { stdout: string }).stdout).toBe("");
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
