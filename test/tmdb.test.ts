import { describe, expect, it, vi } from "vitest";
import {
  fetchTmdbReleaseDates,
  parseTmdbDiscoverPage,
  tmdbDiscoverUrl,
  tmdbReleaseDateRecords,
} from "../worker/src/tmdb";

describe("TMDB theatrical release dates", () => {
  it("builds a Japan theatrical discover query", () => {
    const url = new URL(tmdbDiscoverUrl(2, "2026-07-29"));

    expect(url.origin + url.pathname).toBe(
      "https://api.themoviedb.org/3/discover/movie",
    );
    expect(url.searchParams.get("language")).toBe("ja-JP");
    expect(url.searchParams.get("region")).toBe("JP");
    expect(url.searchParams.get("with_release_type")).toBe("2|3");
    expect(url.searchParams.get("sort_by")).toBe(
      "primary_release_date.desc",
    );
    expect(url.searchParams.get("release_date.gte")).toBe("2026-03-31");
    expect(url.searchParams.get("release_date.lte")).toBe("2026-08-12");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("normalizes localized and original titles to release-date records", () => {
    const page = parseTmdbDiscoverPage({
      page: 1,
      total_pages: 1,
      results: [
        {
          id: 123,
          title: "スパイダーマン：ブランド・ニュー・デイ",
          original_title: "Spider-Man: Brand New Day",
          release_date: "2026-07-31",
        },
        {
          id: "invalid",
          title: "壊れたデータ",
          original_title: "Invalid",
          release_date: "",
        },
      ],
    });

    expect(page.movies).toHaveLength(1);
    expect(tmdbReleaseDateRecords(page.movies)).toEqual([
      {
        titleKey: "スパイダーマン:ブランド・ニュー・デイ",
        tmdbMovieId: 123,
        tmdbTitle: "スパイダーマン：ブランド・ニュー・デイ",
        releaseDate: "2026-07-31",
      },
      {
        titleKey: "spider-man:brandnewday",
        tmdbMovieId: 123,
        tmdbTitle: "スパイダーマン：ブランド・ニュー・デイ",
        releaseDate: "2026-07-31",
      },
    ]);
  });

  it("fetches every returned page with bearer authentication", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          page: 1,
          total_pages: 2,
          results: [
            {
              id: 1,
              title: "作品A",
              original_title: "Movie A",
              release_date: "2026-07-25",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          page: 2,
          total_pages: 2,
          results: [
            {
              id: 2,
              title: "作品B",
              original_title: "Movie B",
              release_date: "2026-07-31",
            },
          ],
        }),
      );

    const records = await fetchTmdbReleaseDates(
      "test-token",
      "2026-07-29",
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({
      accept: "application/json",
      authorization: "Bearer test-token",
    });
    expect(records.some((record) => record.titleKey === "作品b")).toBe(
      true,
    );
  });
});
