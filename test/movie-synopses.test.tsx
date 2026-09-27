import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { testDatabase } from "./helpers/sqlite-d1";
import { onRequestGet } from "../functions/api/showings";
import { MovieSynopsis } from "../src/MovieSynopsis";
import type { MovieTitleRecord, ScheduleResponse } from "../shared/types";

const catalog = () => JSON.parse(readFileSync("data/movie-titles/2026-09-26.json", "utf8"));
const generate = (path = "data/movie-titles/2026-09-26.json") => execFileSync(process.execPath,
  ["--experimental-strip-types", "scripts/reviewed-titles.mjs", path], { encoding: "utf8" });

function withCatalog(run: (data: ReturnType<typeof catalog>, path: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "synopsis-"));
  try { run(catalog(), join(dir, "catalog.json")); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("independent synopses", () => {
  it("returns sourced bilingual synopses independently from introductions and title provenance", async () => {
    const { db, sqlite } = testDatabase();
    try {
      sqlite.exec(generate());
      sqlite.exec("UPDATE movie_title_research SET source_url='https://example.org/title'; UPDATE movie_introductions SET source_url='https://example.org/intro'");
      const response = await onRequestGet({ request: new Request("https://example.org/api/showings?date=2026-09-27"),
        env: { DB: db, PUBLIC_MODE: "true" }, data: {} } as Parameters<typeof onRequestGet>[0]);
      expect(response.status).toBe(200);
      const data = await response.json<ScheduleResponse>();
      const et = catalog().films[0];
      const row = data.movieTitles?.find((row) => row.titleKey === "e.t.");
      expect(row).toMatchObject({ synopsisJa: et.synopsis.ja, synopsisEn: et.synopsis.en,
        synopsisSourceUrl: et.synopsis.sourceUrl, introductionJa: et.introduction.ja,
        sourceUrl: "https://example.org/title", introductionSourceUrl: "https://example.org/intro" });
      expect(JSON.stringify(data)).not.toContain("evidence");
      expect(JSON.stringify(data)).not.toContain("reviewedAt");
      expect(data.movieTitles?.some((row) => row.synopsisJa === null)).toBe(true);
      expect(sqlite.prepare("SELECT count(*) AS n FROM movie_synopses").get()?.n).toBe(15);
    } finally { sqlite.close(); }
  });

  it("preserves newer synopses and independent introductions across replays and omissions", () => {
    withCatalog((data, path) => {
      const { sqlite } = testDatabase();
      try {
        data.films = [data.films[0]];
        writeFileSync(path, JSON.stringify(data));
        const original = generate(path);
        sqlite.exec(original);
        const introduction = sqlite.prepare("SELECT * FROM movie_introductions").all();
        data.films[0].synopsis = { ja: "新しいあらすじ。", en: null, sourceUrl: "https://example.org/new-plot",
          evidence: "New independently reviewed premise", reviewedAt: "2026-09-28T00:00:00.000Z" };
        writeFileSync(path, JSON.stringify(data));
        sqlite.exec(generate(path));
        sqlite.exec(original);
        delete data.films[0].synopsis;
        writeFileSync(path, JSON.stringify(data));
        sqlite.exec(generate(path));
        expect(sqlite.prepare("SELECT * FROM movie_synopses").get()).toMatchObject({
          synopsis_ja: "新しいあらすじ。", synopsis_en: null, source_url: "https://example.org/new-plot",
          evidence: "New independently reviewed premise" });
        expect(sqlite.prepare("SELECT * FROM movie_introductions").all()).toEqual(introduction);
      } finally { sqlite.close(); }
    });
  });

  it.each([
    { ja: null, en: null }, { ja: " " }, { en: "<script>bad</script>" },
    { ja: "あ".repeat(601) }, { en: "x".repeat(1601) }, { evidence: "" },
    { sourceUrl: "javascript:alert(1)" }, { sourceUrl: "https://user:secret@example.org" },
    { reviewedAt: "2026-02-30T00:00:00.000Z" }, { en: 12 },
  ])("rejects invalid synopsis before emitting any SQL: %j", (invalid) => {
    withCatalog((data, path) => {
      Object.assign(data.films[0].synopsis, invalid);
      writeFileSync(path, JSON.stringify(data));
      const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/reviewed-titles.mjs", path], { encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Invalid synopsis");
    });
  });

  it("renders only the selected language, a semantic heading and its own source; hides missing content", () => {
    const movie = { synopsisJa: "あらすじ本文。", synopsisEn: "The premise.",
      synopsisSourceUrl: "https://example.org/plot" } as MovieTitleRecord;
    for (const language of ["ja", "en"] as const) {
      const $ = load(renderToStaticMarkup(<MovieSynopsis movie={movie} language={language} />));
      expect($("section").attr("aria-labelledby")).toBe($("h2").attr("id"));
      expect($("h2").text()).toBe(language === "en" ? "Synopsis" : "あらすじ");
      expect($("p").text()).toBe(language === "en" ? movie.synopsisEn : movie.synopsisJa);
      expect($("a").attr("href")).toBe(movie.synopsisSourceUrl);
    }
    expect(renderToStaticMarkup(<MovieSynopsis language="ja" />)).toBe("");
    expect(renderToStaticMarkup(<MovieSynopsis movie={{ ...movie, synopsisEn: null }} language="en" />)).toBe("");
  });
});
