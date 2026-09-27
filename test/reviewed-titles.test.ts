import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { moviePreferenceKey } from "../shared/movie";
import { testDatabase } from "./helpers/sqlite-d1";

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
});
