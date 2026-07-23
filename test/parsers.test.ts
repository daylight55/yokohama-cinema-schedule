import { describe, expect, it } from "vitest";
import { parseAeonSchedule } from "../worker/src/parsers/aeon";
import { parseEigalandSchedule } from "../worker/src/parsers/eigaland";
import { parseMovilSchedule } from "../worker/src/parsers/movil";
import { parseTjoySchedule } from "../worker/src/parsers/tjoy";

describe("schedule parsers", () => {
  it("normalizes AEON JSON", () => {
    const result = parseAeonSchedule(
      {
        "20260724": {
          movie: [
            {
              id: "show-1",
              name: { ja: "字幕 テスト映画" },
              startDate: "2026-07-24T10:00:00+09:00",
              endDate: "2026-07-24T12:00:00+09:00",
              location: { name: { ja: "スクリーン1" } },
              superEvent: {
                workPerformed: { identifier: "movie-1" },
              },
              offers: {},
            },
          ],
        },
      },
      new Set(["2026-07-24"]),
    );
    expect(result).toMatchObject([
      {
        cinemaId: "aeon-minatomirai",
        movieKey: "movie-1",
        title: "テスト映画",
        format: "字幕",
        screen: "スクリーン1",
      },
    ]);
  });

  it("normalizes Eigaland JSON", () => {
    const result = parseEigalandSchedule(
      [
        {
          movieDetail: { movieId: "movie-1", movieName: "テスト映画" },
          houseList: [
            {
              houseName: "Jack",
              showList: [
                {
                  showId: "show-1",
                  startTime: "2026-07-24T10:00:00+09:00",
                  endTime: "2026-07-24T12:00:00+09:00",
                  ticketingUrl: "https://example.com/ticket",
                  purchasable: true,
                },
              ],
            },
          ],
        },
      ],
      "jack-and-betty",
      "jack-and-betty",
      "https://example.com",
    );
    expect(result[0]).toMatchObject({
      sourceId: "jack-and-betty",
      title: "テスト映画",
      screen: "Jack",
      purchasable: true,
    });
  });

  it("normalizes Movil HTML and handles an after-midnight end", () => {
    const result = parseMovilSchedule(
      `<article class="movie-1">
        <h2>テスト映画</h2>
        <ul class="timetable">
          <li class="theatre"><span class="theatre-num">1</span> 2D</li>
          <li class="check_date available">
            <a href="https://example.com/ticket">
              <time class="start">23:40</time>
              <time class="end">01:50</time>
            </a>
          </li>
        </ul>
      </article>`,
      "2026-07-24",
    );
    expect(result[0]).toMatchObject({
      movieKey: "movie-1",
      startsAt: "2026-07-24T14:40:00.000Z",
      endsAt: "2026-07-24T16:50:00.000Z",
      format: "2D",
    });
  });

  it("normalizes T-Joy HTML", () => {
    const result = parseTjoySchedule(
      `<section class="section-container">
        <a href="/film_detail/123"></a>
        <h2 class="js-title-film">【字幕】 テスト映画</h2>
        <div class="schedule-box">
          <p class="schedule-time">18:10 ～ 20:20</p>
          <p class="theater-name">シアター3</p>
          <div class="schedule-box-body" onclick="location.href='/ticket/123'"></div>
        </div>
      </section>`,
      "2026-07-24",
      "tjoy-yokohama",
      "tjoy-yokohama",
      "https://tjoy.jp/t-joy_yokohama",
    );
    expect(result[0]).toMatchObject({
      movieKey: "123",
      title: "テスト映画",
      format: "字幕",
      screen: "シアター3",
      purchasable: true,
    });
  });
});
