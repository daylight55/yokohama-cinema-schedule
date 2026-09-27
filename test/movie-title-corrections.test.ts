import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { movieDisplayTitle, moviePreferenceKey } from "../shared/movie";
import { collectedMovieTitle } from "../shared/movie-title-corrections";
import { showingSearchText, searchMatchExpression } from "../shared/search";
import { parseTjoySchedule } from "../worker/src/parsers/tjoy";
import { normalizeShowingMovieTitle } from "../worker/src/index";
import { appHashStateFromHash } from "../src/lib";
import { movieTitleRepairSql } from "../scripts/lib/movie-title-repair";
import { testDatabase } from "./helpers/sqlite-d1";

const full = "アベンジャーズ/エンドゲーム:アンコール";
const short = "アベンジャーズ/エンドゲーム:ア";
const key = moviePreferenceKey(full);
const oldKey = moviePreferenceKey(short);
const html = readFileSync("test/fixtures/tjoy-truncated-title.html", "utf8");
const parse = (input = html) => parseTjoySchedule(input, "2026-09-27", "yokohama-burg13", "yokohama-burg13", "https://tjoy.jp/yokohama_burg13");

describe("reviewed movie identity", () => {
  it("resolves the observed truncated source title before creating an app movie key", () => {
    const [parsed] = parse();
    expect(parsed.title).toBe(full);
    expect(parsed.movieKey).toBe("C5089");
    expect(parsed.format).toBe("INFINITY VISION / SCREENX / DolbyAtmos / 字幕");
    expect(parsed.startsAt).toBe("2026-09-27T04:45:00.000Z");
    expect(parsed.bookingUrl).toContain("2056775/C50891V0/12/2026-09-27");
    expect(normalizeShowingMovieTitle(parsed).movieKey).toBe(key);
  });
  it("does not guess a completion for an unknown source, ID or title", () => {
    expect(collectedMovieTitle(short, "other", "C5089")).toBe(short);
    expect(collectedMovieTitle(short, "yokohama-burg13", "C9999")).toBe(short);
    expect(collectedMovieTitle("アベンジャーズ/エンドゲーム:アナザー", "yokohama-burg13", "C5089")).toBe("アベンジャーズ/エンドゲーム:アナザー");
  });
  it.each([
    `インフィニティビジョン ${full}`,
    `${full}【INFINITY VISION】`,
    `${full}(インフィニティビジョン・字幕版)`,
  ])("separates screening metadata from %s without discarding the format", (title) => {
    const parsed = parse()[0];
    const showing = normalizeShowingMovieTitle({ ...parsed, sourceId: "other", movieKey: "42", title, format: "字幕" });
    expect(showing.title).toBe(full);
    expect(showing.movieKey).toBe(key);
    expect(showing.format).toBe("字幕 / INFINITY VISION");
  });
  it("keeps meaningful qualifiers that used to be stripped unconditionally", () => {
    const title = "【前編】作品名";
    expect(parse(html.replace(/【INFINITY VISION・SCREENX with DolbyAtmos・字幕】アベンジャーズ／エンドゲーム：ア/, title))[0].title).toBe(title);
    expect(movieDisplayTitle("インフィニティビジョンの旅")).toBe("インフィニティビジョンの旅");
  });
  it.each([oldKey, "インフィニティビジョン" + key])("keeps old hashes usable: %s", (alias) => {
    expect(appHashStateFromHash(`#movie?date=2026-09-27&movie=${encodeURIComponent(alias)}`)).toMatchObject({ view: "movie", date: "2026-09-27", movie: key });
  });
  it("repairs persisted identities, search, reservations and duplicate preferences without changing bookings", () => {
    const { sqlite } = testDatabase();
    try {
      const source = "yokohama-burg13";
      const start = "2026-09-27T04:45:00.000Z";
      const oldId = [source, source, oldKey, start, "12"].join("|");
      const newId = [source, source, key, start, "12"].join("|");
      sqlite.exec(`INSERT INTO cinemas(id,name,short_name,area,area_label,address,latitude,longitude,source_url,updated_at) VALUES ('${source}','横浜ブルク13','ブルク13','yokohama','横浜','test',0,0,'https://tjoy.jp','now')`);
      sqlite.prepare("INSERT INTO showings(id,source_id,cinema_id,movie_key,title,starts_at,screen,format,booking_url,purchasable,fetched_at,image_url) VALUES (?,?,?,?,?,?,?,?,?,1,'now','https://example.org/film.jpg')").run(oldId, source, source, oldKey, short, start, "12", "SCREENX / 字幕", "https://tjoy.jp/reservation/test");
      sqlite.prepare("INSERT INTO showing_search VALUES (?,?,?,?)").run(oldId,source,"2026-09-27",showingSearchText(short,"横浜ブルク13","ブルク13"));
      sqlite.prepare("INSERT INTO viewing_plans(user_id,showing_id,movie_key,title,cinema_id,cinema_name,cinema_short_name,starts_at,booking_url,created_at,updated_at,reserved_at) VALUES ('legacy-local',?,?,?,?,'横浜ブルク13','ブルク13',?,'https://tjoy.jp/reservation/test','before','before','reserved')").run(oldId,oldKey,short,source,start);
      sqlite.prepare("INSERT INTO movie_preferences(user_id,movie_key,title,starred,status,updated_at) VALUES ('legacy-local',?,?,1,'watched','2026-09-27')").run(oldKey,short);
      sqlite.prepare("INSERT INTO movie_preferences(user_id,movie_key,title,starred,status,updated_at) VALUES ('legacy-local',?,?,0,NULL,'2026-09-26')").run(key,full);
      const rows = [{id:oldId,source_id:source,cinema_id:source,title:short,movie_key:oldKey,starts_at:start,screen:"12",format:"SCREENX / 字幕",cinema_name:"横浜ブルク13",cinema_short_name:"ブルク13"}];
      sqlite.exec("PRAGMA foreign_keys=ON");
      for (const [k,t] of [[oldKey,short],[key,full]]) {
        sqlite.prepare("INSERT INTO movie_title_research(title_key,japanese_title,next_attempt_at,updated_at) VALUES (?,?, 'now','now')").run(k,t);
        sqlite.prepare("INSERT INTO movie_introductions VALUES (?,'紹介','Introduction','evidence','https://example.org','now')").run(k);
        sqlite.prepare("INSERT INTO movie_credits(title_key,next_attempt_at,updated_at) VALUES (?,'now','now')").run(k);
      }
      sqlite.prepare("INSERT INTO movie_synopses(title_key,synopsis_ja,evidence,source_url,reviewed_at) VALUES (?,'あらすじ','evidence','https://example.org','now')").run(oldKey);
      sqlite.prepare("INSERT INTO synopsis_research(title_key,next_attempt_at) VALUES (?,'now')").run(oldKey);
      const sql = movieTitleRepairSql(rows);
      sqlite.exec(sql);
      expect(sqlite.prepare("SELECT id,title,movie_key,booking_url,image_url,format FROM showings").get()).toMatchObject({id:newId,title:full,movie_key:key,booking_url:"https://tjoy.jp/reservation/test",image_url:"https://example.org/film.jpg",format:"SCREENX / 字幕 / INFINITY VISION"});
      expect(sqlite.prepare("SELECT showing_id,reserved_at FROM viewing_plans").get()).toMatchObject({showing_id:newId,reserved_at:"reserved"});
      expect(sqlite.prepare("SELECT movie_key,starred,status FROM movie_preferences").all()).toEqual([{movie_key:key,starred:1,status:"watched"}]);
      expect(sqlite.prepare("SELECT showing_id FROM showing_search WHERE showing_search MATCH ?").get(searchMatchExpression("アンコール"))?.showing_id).toBe(newId);
      for (const table of ["movie_title_research","movie_introductions","movie_credits","movie_synopses","synopsis_research"]) {
        expect(sqlite.prepare(`SELECT title_key FROM ${table}`).all()).toEqual([{title_key:key}]);
      }
      sqlite.exec(sql); // Replaying the reviewed repair is safe.
      expect(sqlite.prepare("SELECT count(*) n FROM showings").get()?.n).toBe(1);
    } finally { sqlite.close(); }
  });
});
