import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import {
  isCompleteTitleTranslation,
  isEnglishMovieTitle,
} from "../shared/movie-title-language";
import { moviePreferenceKey } from "../shared/movie";
import { listMovieTitles } from "../functions/_lib/movie-titles";
import {
  refreshMovieTitleTranslations,
  translatedTitle,
  translateMovieTitle,
} from "../worker/src/title-translation";
import { onRequestGet as showings } from "../functions/api/showings";
import { onRequestGet as sharing } from "../functions/api/sharing";
import { onRequestGet as notifications } from "../functions/api/notifications";

afterEach(() => vi.useRealTimers());
function seed(
  sqlite: ReturnType<typeof testDatabase>["sqlite"],
  title: string,
  options: {
    attempts?: number;
    status?: string;
    english?: string;
    past?: boolean;
  } = {},
) {
  const key = moviePreferenceKey(title);
  sqlite
    .prepare(
      `INSERT INTO movie_title_research(title_key,japanese_title,english_title,status,attempts,next_attempt_at,updated_at) VALUES(?,?,?,?,?,'2000','2000')`,
    )
    .run(
      key,
      title,
      options.english ?? null,
      options.status ?? "unresolved",
      options.attempts ?? 5,
    );
  sqlite
    .prepare(
      `INSERT INTO showings(id,source_id,cinema_id,movie_key,title,starts_at,booking_url,fetched_at) VALUES(?,'toho-kamiooka','toho-kamiooka',?,?,?,'https://example.com','2000')`,
    )
    .run(
      key,
      key,
      title,
      options.past ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
    );
  return key;
}
const model = (response: unknown) =>
  ({ run: vi.fn().mockResolvedValue(response) }) as unknown as Ai;

describe("English display title validation", () => {
  it.each([
    "Your Name",
    "Les Misérables",
    "2001: A Space Odyssey",
    "8½",
    "F1",
    "Movie: Encore!",
  ])("allows Latin release names and numeric titles: %s", (title) => {
    expect(isEnglishMovieTitle(title)).toBe(true);
  });
  it.each([
    null,
    "",
    "  ",
    "君の名は。",
    "Your Name 特別版",
    "映画 Movie",
    "映画 Ｍｏｖｉｅ",
    "영화",
    "Фильм",
    "Unknown",
    "Title\nexplanation",
    "<script>Title</script>",
    "x".repeat(301),
  ])("rejects missing, mixed or unsafe output: %s", (title) => {
    expect(isEnglishMovieTitle(title)).toBe(false);
  });
  it("handles Workers AI object and text envelopes without accepting prose/actions", () => {
    expect(translatedTitle({ response: { englishTitle: " Your Name " } })).toBe(
      "Your Name",
    );
    expect(translatedTitle({ response: '{"englishTitle":"Your Name"}' })).toBe(
      "Your Name",
    );
    expect(translatedTitle({ englishTitle: "Your Name" })).toBe("Your Name");
    for (const response of [
      "Your Name",
      { action: "stop" },
      { englishTitle: "Your Name 君" },
      null,
      [],
    ])
      expect(translatedTitle({ response })).toBeNull();
    expect(
      translatedTitle({
        choices: [{ finish_reason: "length" }],
        response: { englishTitle: "Truncated" },
      }),
    ).toBeNull();
  });
  it("rejects dropped numbers and subtitle labels; preserves already English titles without an AI call", async () => {
    expect(
      isCompleteTitleTranslation("仮面ライダーカブト20th", "V Cinema Next"),
    ).toBe(false);
    expect(
      isCompleteTitleTranslation(
        "仮面ライダーカブト20th",
        "Kamen Rider Kabuto 20th",
      ),
    ).toBe(true);
    expect(
      isCompleteTitleTranslation(
        "【日本語字幕付】5秒で完全犯罪を生成する方法",
        "How to Create a Perfect Crime in 5 Seconds",
      ),
    ).toBe(false);
    const ai = model(null);
    expect(await translateMovieTitle(ai, "SEKIRO:NO DEFEAT", false)).toBe(
      "SEKIRO:NO DEFEAT",
    );
    expect(ai.run).not.toHaveBeenCalled();
  });
});

it("translates exhausted research and invalid verified rows, keeps provenance separate, and skips already valid or past films", async () => {
  const { db, sqlite } = testDatabase();
  try {
    seed(sqlite, "未解決の映画");
    seed(sqlite, "壊れた英訳", {
      status: "verified",
      english: "Japanese 日本語",
      attempts: 0,
    });
    seed(sqlite, "正式名", { status: "verified", english: "Official Name" });
    seed(sqlite, "過去の映画", { past: true });
    seed(sqlite, "まだ調べていない", { attempts: 0, status: "pending" });
    const ai = model({ response: { englishTitle: "An English Title" } });
    expect(await refreshMovieTitleTranslations(db, ai)).toEqual({
      attempted: 2,
      translated: 2,
      failed: 0,
    });
    await refreshMovieTitleTranslations(db, ai);
    expect(ai.run).toHaveBeenCalledTimes(2);
    const titles = await listMovieTitles(db);
    expect(
      titles.find((row) => row.japaneseTitle === "未解決の映画"),
    ).toMatchObject({
      englishTitle: "An English Title",
      sourceKind: "machine_translation",
      sourceUrl: null,
      originalTitle: null,
    });
    expect(
      titles.find((row) => row.japaneseTitle === "壊れた英訳")?.englishTitle,
    ).toBe("An English Title");
    expect(titles.find((row) => row.japaneseTitle === "正式名")).toMatchObject({
      englishTitle: "Official Name",
      sourceKind: "reference",
    });
    expect(
      sqlite
        .prepare(
          "SELECT english_title,status FROM movie_title_research WHERE japanese_title='未解決の映画'",
        )
        .get(),
    ).toMatchObject({ english_title: null, status: "unresolved" });
  } finally {
    sqlite.close();
  }
});

it("checks previously translated rows again and stops at five attempts with 24-hour cooldown", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
  const { db, sqlite } = testDatabase();
  try {
    const key = seed(sqlite, "日本語が残る作品");
    sqlite
      .prepare(
        `INSERT INTO movie_title_translations(title_key,english_title,model,status,attempts,next_attempt_at,updated_at) VALUES(?,'Movie 日本語','test','translated',1,'2000','2000')`,
      )
      .run(key);
    const ai = model({ response: { englishTitle: "Still 日本語" } });
    for (let day = 0; day < 7; day++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 8, 28 + day)));
      await refreshMovieTitleTranslations(db, ai);
      await refreshMovieTitleTranslations(db, ai);
    }
    expect(ai.run).toHaveBeenCalledTimes(4);
    expect(
      sqlite
        .prepare(
          "SELECT attempts,status,last_error FROM movie_title_translations",
        )
        .get(),
    ).toMatchObject({
      attempts: 5,
      status: "failed",
      last_error: "invalid_english_title",
    });
    expect((await listMovieTitles(db))[0].englishTitle).toBeNull();
  } finally {
    sqlite.close();
  }
});

it("isolates invalid output, retries successfully later and caps each batch at five films", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
  const { db, sqlite } = testDatabase();
  try {
    for (let i = 0; i < 7; i++)
      seed(sqlite, `作品${String.fromCharCode(97 + i)}`);
    const ai = model({ response: { englishTitle: "English Film" } });
    vi.mocked(ai.run).mockResolvedValueOnce({
      response: { englishTitle: "作品" },
    });
    expect(await refreshMovieTitleTranslations(db, ai)).toEqual({
      attempted: 5,
      translated: 4,
      failed: 1,
    });
    expect(await refreshMovieTitleTranslations(db, ai)).toEqual({
      attempted: 2,
      translated: 2,
      failed: 0,
    });
    expect(await refreshMovieTitleTranslations(db, ai)).toEqual({
      attempted: 0,
      translated: 0,
      failed: 0,
    });
    vi.advanceTimersByTime(86400000);
    expect(await refreshMovieTitleTranslations(db, ai)).toEqual({
      attempted: 1,
      translated: 1,
      failed: 0,
    });
  } finally {
    sqlite.close();
  }
});

it("pauses service errors without spending attempts for the rest of the batch", async () => {
  const { db, sqlite } = testDatabase();
  try {
    for (let i = 0; i < 3; i++) seed(sqlite, `映画${i}`);
    const ai = model(null);
    vi.mocked(ai.run).mockRejectedValue(new Error("rate limited"));
    expect(await refreshMovieTitleTranslations(db, ai)).toEqual({
      attempted: 1,
      translated: 0,
      failed: 1,
      paused: true,
    });
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect(
      sqlite.prepare("SELECT COUNT(*) n FROM movie_title_translations").get()
        ?.n,
    ).toBe(1);
  } finally {
    sqlite.close();
  }
});

it("claims once during concurrent delivery and lets a concurrent verified import win", async () => {
  const { db, sqlite } = testDatabase();
  try {
    const key = seed(sqlite, "同時更新");
    const ai = {
      run: vi.fn(async () => {
        sqlite
          .prepare(
            "UPDATE movie_title_research SET status='verified',english_title='Verified Release',source_url='https://example.org/film' WHERE title_key=?",
          )
          .run(key);
        return { response: { englishTitle: "Machine Translation" } };
      }),
    } as unknown as Ai;
    await Promise.all([
      refreshMovieTitleTranslations(db, ai),
      refreshMovieTitleTranslations(db, ai),
    ]);
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect((await listMovieTitles(db))[0]).toMatchObject({
      englishTitle: "Verified Release",
      sourceKind: "reference",
      sourceUrl: "https://example.org/film",
    });
  } finally {
    sqlite.close();
  }
});

it("serves the same fallback through schedules, shared lists and the notification feed", async () => {
  const { db, sqlite } = testDatabase();
  try {
    seed(sqlite, "共有の映画");
    await refreshMovieTitleTranslations(
      db,
      model({ response: { englishTitle: "Shared Film" } }),
    );
    sqlite.exec(`INSERT INTO users(id,email,status,role,created_at,updated_at) VALUES('viewer','viewer@example.com','active','member','','');
      INSERT INTO sharing_groups VALUES('group','Friends',''); INSERT INTO sharing_group_members VALUES('group','viewer');`);
    for (const [handler, path, publicOnly, key] of [
      [showings, "showings?date=2099-01-01", true, "movieTitles"],
      [sharing, "sharing?group=group", false, "titles"],
      [notifications, "notifications", false, "titles"],
    ] as const) {
      const response = await handler({
        request: new Request(`https://example.com/api/${path}`),
        env: { DB: db, PUBLIC_MODE: String(publicOnly) },
        data: {
          userId: "viewer",
          authUser: { id: "viewer", status: "active" },
        },
      } as Parameters<typeof handler>[0]);
      expect(response.status).toBe(200);
      const data = (await response.json()) as Record<string, unknown[]>;
      expect(data[key]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            japaneseTitle: "共有の映画",
            englishTitle: "Shared Film",
          }),
        ]),
      );
    }
  } finally {
    sqlite.close();
  }
});
