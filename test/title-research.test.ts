import { describe, expect, it, vi } from "vitest";
import {
  officialPageMatches,
  modelActionText,
  officialUrl,
  researchMovieTitle,
  verifiedCandidate,
  type ResearchModel,
} from "../worker/src/title-research";
const claim = (value: unknown) => ({ mainsnak: { datavalue: { value } } });
const entity = {
  id: "Q21697406",
  labels: { ja: { value: "君の名は。" }, en: { value: "Your Name" } },
  aliases: {},
  claims: {
    P31: [claim({ id: "Q11424" })],
    P1476: [claim({ text: "君の名は。" })],
    P856: [claim("https://gkids.com/films/your-name/")],
  },
  sitelinks: { enwiki: { title: "Your Name" } },
};
const input = { title: "君の名は。" };
const sequence = (actions: unknown[]): ResearchModel => ({
  decide: vi.fn(async () =>
    JSON.stringify(actions.shift() ?? { action: "stop" }),
  ),
});
describe("source-grounded title research agent", () => {
  it("uses names from internet evidence, rejects unrelated media, and never accepts the model's invented text", async () => {
    expect(
      verifiedCandidate(
        { ...entity, claims: { P31: [claim({ id: "Q571" })] } },
        input,
      ),
    ).toBeNull();
    expect(verifiedCandidate(entity, { title: "別の映画" })).toBeNull();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ search: [{ id: entity.id }] }))
      .mockResolvedValueOnce(
        Response.json({ entities: { [entity.id]: entity } }),
      )
      .mockResolvedValueOnce(
        new Response(
          "<html><head><title>Your Name - GKIDS</title></head></html>",
        ),
      );
    const result = await researchMovieTitle(
      input,
      sequence([
        { action: "search", query: input.title },
        { action: "read", id: entity.id },
        { action: "verify_official", id: entity.id },
        {
          action: "accept",
          id: entity.id,
          englishTitle: "An invented translation",
        },
      ]),
      fetcher,
    );
    expect(result?.englishTitle).toBe("Your Name");
    expect(result?.originalTitle).toBe("君の名は。");
    expect(result?.sourceUrl).toBe("https://gkids.com/films/your-name/");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("never exceeds five network requests and stops repeated actions", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ search: [] }));
    const model = sequence(
      Array.from({ length: 9 }, (_, i) => ({
        action: "search",
        query: `movie ${i}`,
      })),
    );
    expect(await researchMovieTitle(input, model, fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(5);
    fetcher.mockClear();
    await researchMovieTitle(
      input,
      sequence([
        { action: "search", query: "same" },
        { action: "search", query: "same" },
      ]),
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("stops immediately after a block and does not read unsearched entity IDs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 429 }));
    await expect(
      researchMovieTitle(
        input,
        sequence([{ action: "search", query: input.title }]),
        fetcher,
      ),
    ).rejects.toThrow("research_access_blocked");
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear();
    expect(
      await researchMovieTitle(
        input,
        sequence([{ action: "read", id: entity.id }]),
        fetcher,
      ),
    ).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("restricts official page retrieval and checks headings rather than arbitrary page text", () => {
    for (const url of [
      "http://gkids.com/",
      "https://gkids.com.evil.test/",
      "https://127.0.0.1/",
      "https://gkids.com@evil.test/",
      "https://gkids.com:8443/",
    ])
      expect(officialUrl(url)).toBeNull();
    expect(
      officialPageMatches(
        "<title>Unrelated</title><script>Your Name</script>",
        "Your Name",
      ),
    ).toBe(false);
    expect(officialPageMatches("<h1>Your Name</h1>", "Your Name")).toBe(true);
  });
});

it("persists a 24-hour cooldown and stops after five unsuccessful research runs", async () => {
  const { testDatabase } = await import("./helpers/sqlite-d1");
  const { refreshMovieTitleResearch } = await import(
    "../worker/src/title-research"
  );
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T00:00:00Z"));
  const { db, sqlite } = testDatabase();
  const ai = {
    run: vi.fn().mockResolvedValue({ response: '{"action":"stop"}' }),
  } as unknown as Ai;
  try {
    sqlite.exec(
      "INSERT INTO showings(id,source_id,cinema_id,movie_key,title,starts_at,booking_url,fetched_at) VALUES ('research','toho-kamiooka','toho-kamiooka','君の名は。','君の名は。','2099-01-01T00:00:00Z','https://example.com','now')",
    );
    await refreshMovieTitleResearch(db, ai);
    await refreshMovieTitleResearch(db, ai);
    expect(ai.run).toHaveBeenCalledTimes(1);
    for (let day = 1; day <= 6; day++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 8, 25 + day)));
      await refreshMovieTitleResearch(db, ai);
    }
    expect(ai.run).toHaveBeenCalledTimes(5);
    expect(
      sqlite.prepare("SELECT attempts FROM movie_title_research").get()
        ?.attempts,
    ).toBe(5);
  } finally {
    sqlite.close();
    vi.useRealTimers();
  }
});

it("executes structured Workers AI JSON actions instead of marking every title unresolved", async () => {
  const actions = [
    { response: { action: "search", query: input.title } },
    { response: { action: "read", id: entity.id } },
    { response: { action: "accept", id: entity.id } },
  ];
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({search: [{id: entity.id}]}))
    .mockResolvedValueOnce(Response.json({entities: {[entity.id]: entity}}));
  const result = await researchMovieTitle(input, {
    decide: async () => modelActionText(actions.shift()),
  }, fetcher);
  expect(result?.englishTitle).toBe("Your Name");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(modelActionText({response: '{"action":"stop"}'})).toBe('{"action":"stop"}');
  expect(modelActionText({response: null})).toBe("");
  expect(modelActionText({response: [{action: "accept"}]})).toBe("");
});

it("preserves titles verified by an import while an AI research attempt is running", async () => {
  const { testDatabase } = await import("./helpers/sqlite-d1");
  const { refreshMovieTitleResearch } = await import("../worker/src/title-research");
  const { db, sqlite } = testDatabase();
  try {
    sqlite.exec("INSERT INTO showings(id,source_id,cinema_id,movie_key,title,starts_at,booking_url,fetched_at) VALUES ('concurrent','toho-kamiooka','toho-kamiooka','君の名は。','君の名は。','2099-01-01T00:00:00Z','https://example.com','now')");
    const ai = { run: vi.fn(async () => {
      sqlite.prepare("UPDATE movie_title_research SET status='verified', english_title='Your Name', source_url='https://gkids.com/films/your-name/' WHERE title_key=?")
        .run("君の名は。");
      return { response: { action: "stop" } };
    }) } as unknown as Ai;
    await refreshMovieTitleResearch(db, ai);
    const row = sqlite.prepare("SELECT status, english_title FROM movie_title_research").get();
    expect(row).toMatchObject({ status: "verified", english_title: "Your Name" });
  } finally {
    sqlite.close();
  }
});
