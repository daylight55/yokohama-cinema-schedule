import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { execFileSync } from "node:child_process";
import {
  creditNames,
  creditSourceIdentity,
  extractMovieCredits,
  matchesCreditFilm,
  researchMovieCredits,
} from "../shared/movie-credits";
import { refreshMovieCredits } from "../worker/src/movie-credits";
import { MovieCredits } from "../src/MovieCredits";
import { onRequestGet } from "../functions/api/showings";
import { testDatabase } from "./helpers/sqlite-d1";
import type { ScheduleResponse } from "../shared/types";

const claim = (value: unknown, extra = {}) => ({
  mainsnak: { datavalue: { value } },
  ...extra,
});
const time = (year: number, precision = 9) =>
  claim({
    time: `+${year}-00-00T00:00:00Z`,
    precision,
    calendarmodel: "http://www.wikidata.org/entity/Q1985727",
  });
const entity = {
  id: "Q11621",
  labels: {
    ja: { value: "E.T." },
    en: { value: "E.T. the Extra-Terrestrial" },
  },
  sitelinks: { jawiki: { title: "E.T." } },
  claims: {
    P31: [claim({ id: "Q11424" })],
    P57: [claim({ id: "Q8877" })],
    P161: [claim({ id: "Q506198" })],
    P577: [time(1982)],
  },
};
const input = {
  japaneseTitle: "E.T.",
  englishTitle: "E.T. the Extra-Terrestrial",
  sourceUrl: "https://ja.wikipedia.org/wiki/E.T.",
};
const people = {
  Q8877: {
    labels: {
      ja: { value: "スティーヴン・スピルバーグ" },
      en: { value: "Steven Spielberg" },
    },
  },
  Q506198: {
    labels: {
      ja: { value: "ヘンリー・トーマス" },
      mul: { value: "Henry Thomas" },
    },
  },
};
const credits = extractMovieCredits(entity, people)!;

describe("source-grounded movie credits", () => {
  it("requires a film with an exact reviewed source or both language titles", () => {
    expect(creditSourceIdentity(input)).toEqual({
      site: "jawiki",
      title: "E.T.",
    });
    expect(
      creditSourceIdentity({
        ...input,
        sourceUrl: "https://ja.wikipedia.org.evil.test/wiki/E.T.",
      }),
    ).toBeNull();
    expect(matchesCreditFilm(entity, input)).toBe(true);
    expect(matchesCreditFilm({ ...entity, sitelinks: {} }, input)).toBe(false);
    expect(
      matchesCreditFilm(
        { ...entity, claims: { P31: [claim({ id: "Q571" })] } },
        input,
      ),
    ).toBe(false);
    expect(matchesCreditFilm(entity, { ...input, entityId: "Q99" })).toBe(
      false,
    );
    expect(matchesCreditFilm(entity, { ...input, sourceUrl: null })).toBe(true);
    expect(
      matchesCreditFilm(entity, {
        ...input,
        sourceUrl: null,
        japaneseTitle: "Different film",
      }),
    ).toBe(false);
  });

  it("uses the first release year, ignores inception and deprecated/imprecise claims, and orders cast by supplied billing position", () => {
    const ordinal = (position: string) => ({
      P1545: [{ datavalue: { value: position } }],
    });
    const result = extractMovieCredits(
      {
        ...entity,
        claims: {
          ...entity.claims,
          P571: [time(1979)],
          P577: [
            time(1984),
            time(1982),
            { ...time(1970), rank: "deprecated" },
            time(1900, 7),
          ],
          P57: [
            ...entity.claims.P57,
            claim({ id: "Q999" }, { rank: "deprecated" }),
          ],
          P161: [
            claim({ id: "Q8877" }, { qualifiers: ordinal("2") }),
            claim({ id: "Q506198" }, { qualifiers: ordinal("1") }),
            claim({ id: "Q999" }),
          ],
        },
      },
      people,
    )!;
    expect(result.releaseYear).toBe(1982);
    expect(result.directors).toHaveLength(1);
    expect(result.cast.map((person) => person.id)).toEqual([
      "Q506198",
      "Q8877",
    ]);
    expect(result.cast[0].en).toBe("Henry Thomas");
    expect(
      extractMovieCredits(
        { ...entity, claims: { P571: [time(1979)] } },
        people,
      ),
    ).toBeNull();
  });

  it("supports voice actors, limits cast, and omits missing labels instead of showing entity IDs", () => {
    const voice = extractMovieCredits(
      {
        ...entity,
        claims: {
          ...entity.claims,
          P161: [],
          P725: [claim({ id: "Q506198" })],
        },
      },
      people,
    )!;
    expect(voice.cast[0].en).toBe("Henry Thomas");
    const manyPeople = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [
        `Q${i + 1}`,
        { labels: { en: { value: `Actor ${i}` } } },
      ]),
    );
    const many = extractMovieCredits(
      {
        ...entity,
        claims: {
          P161: Array.from({ length: 10 }, (_, i) =>
            claim({ id: `Q${i + 1}` }),
          ),
        },
      },
      manyPeople,
    )!;
    expect(many.cast).toHaveLength(6);
    expect(creditNames([{ id: "Q1", ja: "名前", en: null }], "en")).toEqual([]);
    expect(creditNames([{ id: "Q1", ja: null, en: "Name" }], "ja")).toEqual([
      "Name",
    ]);
  });

  it("fetches only the Wikidata API, combines person lookups, and requests multilingual names", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ entities: { Q11621: entity } }))
      .mockResolvedValueOnce(Response.json({ entities: people }));
    expect(await researchMovieCredits(input, request)).toEqual(credits);
    expect(request).toHaveBeenCalledTimes(2);
    for (const [url, options] of request.mock.calls) {
      expect(new URL(String(url)).origin).toBe("https://www.wikidata.org");
      expect(options?.redirect).toBe("error");
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
    const namesUrl = new URL(String(request.mock.calls[1][0]));
    expect(namesUrl.searchParams.get("ids")).toBe("Q8877|Q506198");
    expect(namesUrl.searchParams.get("languages")).toBe("ja|en|mul");
  });

  it("does not guess between same-name remakes", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ search: [{ id: "Q11621" }, { id: "Q99" }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          entities: { Q11621: entity, Q99: { ...entity, id: "Q99" } },
        }),
      );
    expect(
      await researchMovieCredits({ ...input, sourceUrl: null }, request),
    ).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([403, 429, 500])(
    "stops immediately on HTTP %s with no retry",
    async (status) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("", { status }));
      await expect(researchMovieCredits(input, request)).rejects.toThrow();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it("stops on an API-level error or oversized response", async () => {
    const error = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: { code: "maxlag" } }));
    await expect(researchMovieCredits(input, error)).rejects.toThrow(
      "credits_api_error",
    );
    const oversized = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("x".repeat(2_000_001)));
    await expect(researchMovieCredits(input, oversized)).rejects.toThrow(
      "credits_response_too_large",
    );
  });
});

function seed(sqlite: ReturnType<typeof testDatabase>["sqlite"], count = 1) {
  for (let i = 0; i < count; i++)
    sqlite
      .prepare(
        `INSERT INTO movie_title_research(title_key,japanese_title,english_title,source_url,status,next_attempt_at,updated_at)
    VALUES (?, 'E.T.', 'E.T. the Extra-Terrestrial', ?, 'verified','before','before')`,
      )
      .run(`film${i}`, input.sourceUrl);
}
describe("bounded D1 credits enrichment", () => {
  it("spends at most five attempts with a daily lease and no page-triggered retry", async () => {
    const { db, sqlite } = testDatabase();
    seed(sqlite);
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ entities: {} }));
    try {
      await refreshMovieCredits(db, request);
      await refreshMovieCredits(db, request);
      expect(request).toHaveBeenCalledTimes(1);
      for (let i = 0; i < 8; i++) {
        sqlite.exec("UPDATE movie_credits SET next_attempt_at='2000-01-01'");
        await refreshMovieCredits(db, request);
      }
      expect(request).toHaveBeenCalledTimes(5);
      expect(
        sqlite.prepare("SELECT attempts,status FROM movie_credits").get(),
      ).toEqual({ attempts: 5, status: "unresolved" });
    } finally {
      sqlite.close();
    }
  });

  it("caps a scheduled run at three titles and retains verified data", async () => {
    const { db, sqlite } = testDatabase();
    seed(sqlite, 4);
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        new URL(String(url)).searchParams.get("props") === "labels"
          ? Response.json({ entities: people })
          : Response.json({ entities: { Q11621: entity } }),
      );
    try {
      await refreshMovieCredits(db, request);
      expect(request).toHaveBeenCalledTimes(6);
      expect(
        sqlite
          .prepare(
            "SELECT count(*) AS count FROM movie_credits WHERE status='verified'",
          )
          .get()?.count,
      ).toBe(3);
      const before = sqlite
        .prepare("SELECT * FROM movie_credits WHERE title_key='film0'")
        .get();
      await refreshMovieCredits(db, request);
      expect(
        sqlite
          .prepare("SELECT * FROM movie_credits WHERE title_key='film0'")
          .get(),
      ).toEqual(before);
      expect(request).toHaveBeenCalledTimes(8);
    } finally {
      sqlite.close();
    }
  });

  it("stops the batch on upstream denial and does not spend other titles’ attempts", async () => {
    const { db, sqlite } = testDatabase();
    seed(sqlite, 3);
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 429 }));
    try {
      await refreshMovieCredits(db, request);
      expect(request).toHaveBeenCalledTimes(1);
      expect(
        sqlite
          .prepare("SELECT attempts FROM movie_credits ORDER BY title_key")
          .all()
          .map((row) => row.attempts),
      ).toEqual([1, 0, 0]);
    } finally {
      sqlite.close();
    }
  });

  it("claims a title only once when scheduled invocations overlap", async () => {
    const { db, sqlite } = testDatabase();
    seed(sqlite);
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        new URL(String(url)).searchParams.get("props") === "labels"
          ? Response.json({ entities: people })
          : Response.json({ entities: { Q11621: entity } }),
      );
    try {
      await Promise.all([
        refreshMovieCredits(db, request),
        refreshMovieCredits(db, request),
      ]);
      expect(request).toHaveBeenCalledTimes(2);
      expect(
        sqlite.prepare("SELECT attempts,status FROM movie_credits").get(),
      ).toEqual({ attempts: 1, status: "verified" });
    } finally {
      sqlite.close();
    }
  });

  it("imports the collected checkpoint idempotently and exposes credits through the API", async () => {
    const { db, sqlite } = testDatabase();
    try {
      sqlite.exec(
        execFileSync(
          process.execPath,
          ["--experimental-strip-types", "scripts/reviewed-titles.mjs"],
          { encoding: "utf8" },
        ),
      );
      const sql = execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "scripts/movie-credits.mjs",
          "sql",
          "data/movie-credits/2026-09-27.json",
        ],
        { encoding: "utf8" },
      );
      sqlite.exec(sql);
      const before = sqlite
        .prepare("SELECT * FROM movie_credits ORDER BY title_key")
        .all();
      sqlite.exec(sql);
      expect(
        sqlite.prepare("SELECT * FROM movie_credits ORDER BY title_key").all(),
      ).toEqual(before);
      const response = await onRequestGet({
        request: new Request("https://example.com/api/showings"),
        env: { DB: db, PUBLIC_MODE: "true" },
        data: {},
      } as Parameters<typeof onRequestGet>[0]);
      const data = await response.json<ScheduleResponse>();
      expect(
        data.movieTitles?.find((row) => row.titleKey === "e.t.")?.credits,
      ).toMatchObject({
        entityId: "Q11621",
        releaseYear: 1982,
        directors: [{ en: "Steven Spielberg" }],
      });
      expect(JSON.stringify(data)).not.toContain("creditsJson");
    } finally {
      sqlite.close();
    }
  });
});

describe("bilingual credit display", () => {
  it("renders semantic, localized credits without claiming a production year or leading role", () => {
    const ja = load(
      renderToStaticMarkup(<MovieCredits credits={credits} language="ja" />),
    );
    const en = load(
      renderToStaticMarkup(<MovieCredits credits={credits} language="en" />),
    );
    expect(
      ja("dt")
        .map((_, el) => ja(el).text())
        .get(),
    ).toEqual(["監督", "初公開年", "出演"]);
    expect(ja("dd").text()).toContain("スティーヴン・スピルバーグ");
    expect(en("dd").text()).toContain("Steven Spielberg");
    expect(en("a").attr("href")).toBe("https://www.wikidata.org/wiki/Q11621");
    expect(en("body").text()).not.toContain("主演");
    expect(
      renderToStaticMarkup(<MovieCredits credits={null} language="en" />),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <MovieCredits
          credits={{ ...credits, releaseYear: null, directors: [], cast: [] }}
          language="ja"
        />,
      ),
    ).toBe("");
  });
});
