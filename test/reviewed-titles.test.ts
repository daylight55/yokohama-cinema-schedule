import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { moviePreferenceKey } from "../shared/movie";
import { testDatabase } from "./helpers/sqlite-d1";
import { onRequestGet } from "../functions/api/showings";
import type { ScheduleResponse } from "../shared/types";

const catalogPath = "data/movie-titles/2026-09-26.json";
const reviewedSql = (path = catalogPath) => execFileSync(process.execPath,
  ["--experimental-strip-types", "scripts/reviewed-titles.mjs", path], { encoding: "utf8" });

describe("reviewed title import", () => {
  it("imports the sourced catalog with existing movie keys, escapes titles, and preserves verified records on repeat", () => {
    const sql = execFileSync(process.execPath, ["--experimental-strip-types", "scripts/reviewed-titles.mjs"], { encoding: "utf8" });
    const catalog = JSON.parse(readFileSync("data/movie-titles/2026-09-26.json", "utf8")) as {
      films: Array<{ japaneseTitles: string[]; englishTitle: string; sourceUrl: string }>;
    };
    const { sqlite } = testDatabase();
    const key = moviePreferenceKey("ワンオペレーション");
    try {
      sqlite.prepare("INSERT INTO movie_title_research(title_key,japanese_title,attempts,status,next_attempt_at,updated_at) VALUES (?, ?, 4, 'unresolved', 'later', 'before')")
        .run(key, "ワンオペレーション");
      sqlite.exec(sql);
      for (const film of catalog.films) {
        for (const title of film.japaneseTitles) {
          const row = sqlite.prepare("SELECT * FROM movie_title_research WHERE title_key = ?").get(moviePreferenceKey(title));
          expect(row?.english_title).toBe(film.englishTitle);
          expect(row?.source_url).toBe(film.sourceUrl);
          expect(row?.status).toBe("verified");
          expect(moviePreferenceKey(String(row?.japanese_title))).toBe(moviePreferenceKey(title));
        }
      }
      expect(sqlite.prepare("SELECT attempts FROM movie_title_research WHERE title_key = ?").get(key)?.attempts).toBe(4);
      sqlite.prepare("UPDATE movie_title_research SET english_title = 'Existing reviewed title', source_url = 'https://example.org/verified' WHERE title_key = ?").run(key);
      const before = sqlite.prepare("SELECT * FROM movie_title_research ORDER BY title_key").all();
      sqlite.exec(sql);
      expect(sqlite.prepare("SELECT * FROM movie_title_research ORDER BY title_key").all()).toEqual(before);
    } finally {
      sqlite.close();
    }
  });

  it("returns both introduction languages and their own source, never raw evidence, through the schedule API", async () => {
    const { db, sqlite } = testDatabase();
    try {
      sqlite.exec(reviewedSql());
      const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
      const film = catalog.films[0];
      const key = moviePreferenceKey(film.japaneseTitles[0]);
      sqlite.prepare("UPDATE movie_title_research SET source_url='https://example.org/title-only' WHERE title_key=?").run(key);
      const response = await onRequestGet({
        request: new Request("https://example.com/api/showings?date=2026-09-27"),
        env: { DB: db, PUBLIC_MODE: "true" }, data: {},
      } as Parameters<typeof onRequestGet>[0]);
      expect(response.status).toBe(200);
      const data = await response.json<ScheduleResponse>();
      expect(data.movieTitles?.find((row) => row.titleKey === key)).toMatchObject({
        introductionJa: film.introduction.ja,
        introductionEn: film.introduction.en,
        introductionSourceUrl: film.sourceUrl,
        sourceUrl: "https://example.org/title-only",
      });
      expect(JSON.stringify(data)).not.toContain(film.evidence);
      expect(data.movieTitles?.find((row) => row.titleKey === moviePreferenceKey("さとこはいつも")))
        .toMatchObject({ introductionJa: null, introductionEn: null });
      for (const film of catalog.films.filter((film: { introduction?: unknown }) => film.introduction)) {
        for (const title of film.japaneseTitles) {
          const row = sqlite.prepare("SELECT * FROM movie_introductions WHERE title_key=?").get(moviePreferenceKey(title));
          expect(row).toMatchObject({ introduction_ja: film.introduction.ja, introduction_en: film.introduction.en,
            evidence: film.evidence, source_url: film.sourceUrl });
        }
      }
    } finally { sqlite.close(); }
  });

  it("updates reviewed introductions independently of verified titles and ignores older imports", () => {
    const { sqlite } = testDatabase();
    const dir = mkdtempSync(join(tmpdir(), "movie-introductions-"));
    try {
      const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
      const film = catalog.films[0];
      catalog.films = [film];
      const path = join(dir, "catalog.json");
      writeFileSync(path, JSON.stringify(catalog));
      const originalSql = reviewedSql(path);
      sqlite.exec(originalSql);
      const key = moviePreferenceKey(film.japaneseTitles[0]);
      sqlite.prepare("UPDATE movie_title_research SET english_title='Preserved', attempts=3 WHERE title_key=?").run(key);
      catalog.introductionReviewedAt = "2026-09-28T00:00:00.000Z";
      film.introduction.ja = "改訂した紹介文。";
      film.evidence = "New reviewed evidence";
      writeFileSync(path, JSON.stringify(catalog));
      sqlite.exec(reviewedSql(path));
      sqlite.exec(originalSql);
      expect(sqlite.prepare("SELECT * FROM movie_introductions WHERE title_key=?").get(key))
        .toMatchObject({ introduction_ja: "改訂した紹介文。", evidence: "New reviewed evidence" });
      expect(sqlite.prepare("SELECT english_title, attempts FROM movie_title_research WHERE title_key=?").get(key))
        .toEqual({ english_title: "Preserved", attempts: 3 });
    } finally { sqlite.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(["", "<script>unsafe</script>", "x".repeat(601)])("rejects an invalid introduction before emitting SQL", (text) => {
    const dir = mkdtempSync(join(tmpdir(), "movie-introductions-invalid-"));
    try {
      const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
      catalog.films[0].introduction.en = text;
      const path = join(dir, "catalog.json");
      writeFileSync(path, JSON.stringify(catalog));
      expect(() => reviewedSql(path)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
