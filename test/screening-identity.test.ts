import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import {
  MovieIdentityBudget,
  validateSourceMovieTitles,
} from "../worker/src/movie-identity";
import {
  ScreeningIdentityMatcher,
  screeningLabels,
  type ScreeningInput,
  type ScreeningModel,
} from "../worker/src/screening-identity";
import type { NormalizedShowing } from "../shared/types";

const film = "青春ブタ野郎はディアフレンドの夢を見ない";
const input: ScreeningInput = {
  sourceId: "tjoy-yokohama",
  sourceMovieId: "C4859",
  observedTitles: [`【特別音響上映】${film}`],
  officialTitle: film,
  evidenceUrl: "https://tjoy.jp/t-joy_yokohama/cinema_detail/C4859",
};
const catalog = [
  {
    sourceId: "toho-kamiooka",
    title: film,
    evidenceUrl: "https://hlo.tohotheater.jp",
  },
];
const answer = (
  name: string,
  choice: string,
  confidence = 0.99,
  probability = 0.99,
) => ({
  model: "jev-1.13.0",
  answers: {
    [name]: {
      type: "choice",
      choice,
      confidence,
      probabilities: { [choice]: probability },
    },
  },
});
function model() {
  return {
    decide: vi
      .fn()
      .mockResolvedValueOnce(answer("screening", "special"))
      .mockResolvedValueOnce(answer("identity", "same")),
  };
}
afterEach(() => vi.useRealTimers());

describe("Jev screening identity", () => {
  it("classifies special presentation before matching against an existing film and reuses evidence-scoped decisions", async () => {
    const { db, sqlite } = testDatabase();
    try {
      const ai = model(),
        matcher = new ScreeningIdentityMatcher(db, ai);
      expect(await matcher.match(input, catalog)).toEqual({
        status: "matched",
        title: film,
      });
      expect(ai.decide.mock.calls[0][1]).toHaveProperty("screening");
      expect(ai.decide.mock.calls[1][1]).toHaveProperty("identity");
      expect(ai.decide.mock.calls[1][0].candidate.evidence).toEqual(catalog);
      expect(await matcher.match(input, catalog)).toEqual({
        status: "matched",
        title: film,
      });
      expect(ai.decide).toHaveBeenCalledTimes(2);
      const record = sqlite
        .prepare("SELECT * FROM movie_screening_matches")
        .get();
      expect(record).toMatchObject({
        decision: "matched",
        canonical_title: film,
        model: "typesafe/jev",
      });
      expect(JSON.parse(String(record?.response_json))).toHaveLength(2);
      // New official evidence must never inherit an earlier decision.
      ai.decide.mockResolvedValue(answer("screening", "unknown"));
      expect(
        (
          await matcher.match(
            { ...input, evidenceUrl: input.evidenceUrl + "?updated=1" },
            catalog,
          )
        ).status,
      ).toBe("held");
      expect(ai.decide).toHaveBeenCalledTimes(3);
    } finally {
      sqlite.close();
    }
  });

  it.each([
    answer("screening", "different"),
    answer("screening", "special", 0.6),
    answer("screening", "special", 0.99, 0.5),
    answer("screening", "special", NaN),
    {
      answers: {
        screening: { type: "choice", choice: "special", confidence: 1 },
      },
    },
    { response: "special" },
    null,
  ])(
    "holds uncertain or malformed style decisions without running identity matching: %j",
    async (response) => {
      const { db, sqlite } = testDatabase();
      try {
        const ai = { decide: vi.fn().mockResolvedValue(response) };
        expect(
          (await new ScreeningIdentityMatcher(db, ai).match(input, catalog))
            .status,
        ).toBe("held");
        expect(ai.decide).toHaveBeenCalledTimes(1);
      } finally {
        sqlite.close();
      }
    },
  );

  it("requires a separately confident identity match and backs off failed decisions", async () => {
    const { db, sqlite } = testDatabase();
    try {
      const ai = model();
      ai.decide
        .mockReset()
        .mockResolvedValueOnce(answer("screening", "special"))
        .mockResolvedValue(answer("identity", "different"));
      const matcher = new ScreeningIdentityMatcher(db, ai);
      expect(await matcher.match(input, catalog)).toEqual({
        status: "held",
        reason: "screening_identity_uncertain",
      });
      expect(await matcher.match(input, catalog)).toEqual({
        status: "held",
        reason: "screening_identity_uncertain",
      });
      expect(ai.decide).toHaveBeenCalledTimes(2);
    } finally {
      sqlite.close();
    }
  });

  it("does not strip editions, sequels or words inside a title, even with a permissive model", async () => {
    const { db, sqlite } = testDatabase();
    try {
      const ai = model(),
        matcher = new ScreeningIdentityMatcher(db, ai);
      for (const title of [
        `【前編】${film}`,
        `${film}【後編】`,
        `【2026年版】${film}`,
        `【完全版】${film}`,
        `新${film}`,
        `${film} 2`,
        `${film}別作品`,
      ]) {
        expect(screeningLabels(title, film)).toBeNull();
        expect(
          await matcher.match(
            { ...input, observedTitles: [title], officialTitle: title },
            catalog,
          ),
        ).toEqual({ status: "unchanged" });
      }
      expect(ai.decide).not.toHaveBeenCalled();
      expect(
        await matcher.match(
          { ...input, observedTitles: [`【応援上映】${film}`] },
          [],
        ),
      ).toEqual({ status: "unchanged" });
    } finally {
      sqlite.close();
    }
  });

  it("expires decisions without sliding the expiry and bounds model calls across cinemas", async () => {
    const { db, sqlite } = testDatabase();
    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-21T00:00:00Z"));
      const ai = {
        decide: vi.fn<ScreeningModel["decide"]>(async (_state, questions) =>
          "screening" in questions
            ? answer("screening", "special")
            : answer("identity", "same"),
        ),
      };
      const matcher = new ScreeningIdentityMatcher(db, ai);
      expect((await matcher.match(input, catalog)).status).toBe("matched");
      const expiry = sqlite
        .prepare("SELECT expires_at FROM movie_screening_matches")
        .get()?.expires_at;
      vi.advanceTimersByTime(86400_000);
      expect((await matcher.match(input, catalog)).status).toBe("matched");
      expect(
        sqlite.prepare("SELECT expires_at FROM movie_screening_matches").get()
          ?.expires_at,
      ).toBe(expiry);
      expect(
        (
          await matcher.match(
            { ...input, sourceId: "yokohama-burg13" },
            catalog,
          )
        ).status,
      ).toBe("matched");
      expect(
        await matcher.match({ ...input, sourceMovieId: "C9999" }, catalog),
      ).toEqual({ status: "held", reason: "screening_model_budget_exhausted" });
      expect(ai.decide).toHaveBeenCalledTimes(4);
      vi.advanceTimersByTime(30 * 86400_000);
      expect(
        (await new ScreeningIdentityMatcher(db, ai).match(input, catalog))
          .status,
      ).toBe("matched");
      expect(ai.decide).toHaveBeenCalledTimes(6);
    } finally {
      sqlite.close();
    }
  });
});

describe("special screening ingestion", () => {
  it("resolves another cinema's stored event label when the incoming title is already plain", async () => {
    const { db, sqlite } = testDatabase();
    try {
      seed(sqlite);
      const storedTitle = `【抱っこdeシネマ】${film}`;
      sqlite
        .prepare(
          "INSERT INTO showings(id,source_id,cinema_id,movie_key,title,starts_at,booking_url,fetched_at,source_movie_id) VALUES('event','toho-kamiooka','toho-kamiooka',?,?,'2026-10-21T02:00:00Z','https://example.com','before','event-id')",
        )
        .run(film, storedTitle);
      const ai = model();
      const result = await validateSourceMovieTitles(
        db,
        input.sourceId,
        [{ ...showing, title: film, sourceTitle: film }],
        new MovieIdentityBudget(),
        async () => film,
        new ScreeningIdentityMatcher(db, ai),
      );
      expect(result.dateErrors.size).toBe(0);
      expect(result.showings[0].title).toBe(film);
      expect(ai.decide.mock.calls[0][0].listing.sourceId).toBe("toho-kamiooka");
      expect(
        sqlite
          .prepare("SELECT title,fetched_at FROM showings WHERE id='event'")
          .get(),
      ).toMatchObject({ title: storedTitle, fetched_at: "before" });
    } finally {
      sqlite.close();
    }
  });
  it("reports every rejected identity on an affected date instead of hiding earlier failures", async () => {
    const { db, sqlite } = testDatabase();
    try {
      seed(sqlite);
      const result = await validateSourceMovieTitles(
        db,
        input.sourceId,
        [showing, { ...showing, movieKey: "C4975", title: "汝、星のごとく" }],
        new MovieIdentityBudget(),
        async () => {
          throw new Error("detail_http_403");
        },
      );
      expect(result.dateErrors.get("2026-10-21")).toContain(
        "C4859 (detail_unavailable:detail_http_403)",
      );
      expect(result.dateErrors.get("2026-10-21")).toContain(
        "C4975 (detail_budget_exhausted)",
      );
    } finally {
      sqlite.close();
    }
  });
  function seed(sqlite: ReturnType<typeof testDatabase>["sqlite"]) {
    for (const id of [input.sourceId, "toho-kamiooka"])
      sqlite
        .prepare(
          "INSERT OR IGNORE INTO cinemas(id,name,short_name,area,area_label,address,latitude,longitude,source_url,updated_at) VALUES(?,?,?,'yokohama','横浜','test',0,0,'https://example.com','now')",
        )
        .run(id, id, id);
    sqlite
      .prepare(
        "INSERT INTO showings(id,source_id,cinema_id,movie_key,title,starts_at,booking_url,fetched_at) VALUES('existing','toho-kamiooka','toho-kamiooka',?,?,'2026-10-21T02:00:00Z','https://example.com','before')",
      )
      .run(film, film);
  }
  const showing: NormalizedShowing = {
    sourceId: input.sourceId,
    cinemaId: input.sourceId,
    movieKey: "C4859",
    title: input.observedTitles[0],
    sourceTitle: input.observedTitles[0],
    imageUrl: null,
    startsAt: "2026-10-21T03:00:00Z",
    endsAt: null,
    screen: "1",
    format: null,
    bookingUrl: input.evidenceUrl,
    purchasable: true,
  };
  it("publishes the verified film while retaining sound/event labels and official source identity", async () => {
    const { db, sqlite } = testDatabase();
    try {
      seed(sqlite);
      const ai = model(),
        matcher = new ScreeningIdentityMatcher(db, ai);
      const result = await validateSourceMovieTitles(
        db,
        input.sourceId,
        [showing],
        new MovieIdentityBudget(),
        async () => input.observedTitles[0],
        matcher,
      );
      expect(result.dateErrors.size).toBe(0);
      expect(result.showings[0]).toMatchObject({
        title: film,
        sourceMovieId: "C4859",
        sourceTitle: showing.sourceTitle,
        format: "【特別音響上映】",
      });
      expect(
        sqlite
          .prepare(
            "SELECT canonical_title FROM source_movie_identity WHERE source_movie_id='C4859'",
          )
          .get()?.canonical_title,
      ).toBe(showing.title);
      expect(
        sqlite.prepare("SELECT title FROM showings WHERE id='existing'").get()
          ?.title,
      ).toBe(film);
      const cached = await validateSourceMovieTitles(
        db,
        input.sourceId,
        [showing],
        new MovieIdentityBudget(),
        async () => {
          throw new Error("must use cache");
        },
        matcher,
      );
      expect(cached.showings[0].title).toBe(film);
      expect(ai.decide).toHaveBeenCalledTimes(2);
    } finally {
      sqlite.close();
    }
  });
  it("also checks official schedule labels from non-T-Joy cinemas without upgrading their verification", async () => {
    const { db, sqlite } = testDatabase();
    try {
      seed(sqlite);
      const ai = model();
      const result = await validateSourceMovieTitles(
        db,
        "aeon-minatomirai",
        [
          {
            ...showing,
            sourceId: "aeon-minatomirai",
            cinemaId: "aeon-minatomirai",
          },
        ],
        new MovieIdentityBudget(),
        async () => {
          throw new Error("not a T-Joy detail");
        },
        new ScreeningIdentityMatcher(db, ai),
      );
      expect(result.dateErrors.size).toBe(0);
      expect(result.showings[0]).toMatchObject({
        title: film,
        format: "【特別音響上映】",
      });
      expect(
        sqlite
          .prepare(
            "SELECT verification,canonical_title FROM source_movie_identity WHERE source_id='aeon-minatomirai'",
          )
          .get(),
      ).toMatchObject({
        verification: "observed",
        canonical_title: showing.title,
      });
      expect(ai.decide).toHaveBeenCalledTimes(2);
    } finally {
      sqlite.close();
    }
  });
  it("holds an affected day on unavailable Jev and preserves the existing published data", async () => {
    const { db, sqlite } = testDatabase();
    try {
      seed(sqlite);
      const ai = {
        decide: vi
          .fn()
          .mockRejectedValue(
            new Error("2021: Insufficient AI Gateway credits"),
          ),
      };
      const result = await validateSourceMovieTitles(
        db,
        input.sourceId,
        [showing],
        new MovieIdentityBudget(),
        async () => film,
        new ScreeningIdentityMatcher(db, ai),
      );
      expect(result.showings).toHaveLength(0);
      expect(result.dateErrors.get("2026-10-21")).toContain(
        "screening_model_insufficient_credits",
      );
      expect(sqlite.prepare("SELECT COUNT(*) n FROM showings").get()?.n).toBe(
        1,
      );
      expect(
        sqlite.prepare("SELECT reason FROM movie_ingestion_issues").get()
          ?.reason,
      ).toBe("screening_model_insufficient_credits");
      expect(ai.decide).toHaveBeenCalledTimes(1);
    } finally {
      sqlite.close();
    }
  });
});
