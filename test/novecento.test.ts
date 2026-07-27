import { describe, expect, it } from "vitest";
import { dateRange } from "../shared/date";
import {
  parseReviewedNovecentoSchedule,
  parseNovecentoScheduleImages,
} from "../worker/src/parsers/novecento";

describe("Cinema Novecento schedule parser", () => {
  it("selects only weekly images that overlap the requested dates", () => {
    const html = `
      <h2>2026年7月25日～2026年8月30日のスケジュール</h2>
      <img width="600" height="106" alt="725.jpg"
        src="https://static.wixstatic.com/media/week-725.jpg/v1/fill/w_600,h_106/725.jpg">
      <img width="600" height="106" alt="81.jpg"
        src="https://static.wixstatic.com/media/week-81.jpg/v1/fill/w_600,h_106/81.jpg">
      <img width="600" height="106" alt="88.jpg"
        src="https://static.wixstatic.com/media/week-88.jpg/v1/fill/w_600,h_106/88.jpg">
      <img width="116" height="163" alt="1900.jpg"
        src="https://static.wixstatic.com/media/poster.jpg/v1/fill/w_116,h_163/poster.jpg">
    `;

    expect(
      parseNovecentoScheduleImages(html, [
        "2026-07-27",
        "2026-07-28",
        "2026-07-29",
        "2026-07-30",
        "2026-07-31",
        "2026-08-01",
        "2026-08-02",
      ]),
    ).toEqual([
      {
        weekStart: "2026-07-25",
        imageUrl: "https://static.wixstatic.com/media/week-725.jpg",
      },
      {
        weekStart: "2026-08-01",
        imageUrl: "https://static.wixstatic.com/media/week-81.jpg",
      },
    ]);
  });

  it("returns reviewed screenings only while the official image is unchanged", () => {
    const result = parseReviewedNovecentoSchedule(
      [
        {
          weekStart: "2026-08-01",
          imageUrl:
            "https://static.wixstatic.com/media/ac9ab3_4050f57d0faf4d08a2bb27179832e237~mv2.jpg",
        },
      ],
      ["2026-08-01", "2026-08-02"],
    );

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({
      cinemaId: "novecento",
      title: "POCA PON ポカポン",
      startsAt: "2026-08-01T02:45:00.000Z",
      format: null,
    });
    expect(result[1]).toMatchObject({
      title: "ヘブンズベル",
      startsAt: "2026-08-01T06:10:00.000Z",
      format: "特別プログラム",
    });
    expect(result[2]).toMatchObject({
      title: "ヘブンズベル",
      startsAt: "2026-08-02T02:30:00.000Z",
      format: null,
    });
    expect(result[3]).toMatchObject({
      title: "POCA PON ポカポン",
      startsAt: "2026-08-02T05:00:00.000Z",
      format: "特別プログラム",
    });
  });

  it("rejects a replaced official image until it has been reviewed", () => {
    expect(() =>
      parseReviewedNovecentoSchedule(
        [
          {
            weekStart: "2026-08-01",
            imageUrl:
              "https://static.wixstatic.com/media/replaced.jpg",
          },
        ],
        ["2026-08-01"],
      ),
    ).toThrow("未確認のノヴェチェント週間表です");
  });

  it("covers all 60 reviewed screenings through the final program", () => {
    const images = [
      [
        "2026-07-25",
        "ac9ab3_f1a0e00eb51540c49e425238990e774c",
      ],
      [
        "2026-08-01",
        "ac9ab3_4050f57d0faf4d08a2bb27179832e237",
      ],
      [
        "2026-08-08",
        "ac9ab3_2d3a7b1e04d34ce5bc1d2e0455f63a4c",
      ],
      [
        "2026-08-15",
        "ac9ab3_bdea276044ba4e11a6cb0e9ee662b097",
      ],
      [
        "2026-08-22",
        "ac9ab3_180c348048004c52b519bb28f9927361",
      ],
      [
        "2026-08-29",
        "ac9ab3_943a218121bc46dd92333e1edae5ac86",
      ],
    ].map(([weekStart, mediaId]) => ({
      weekStart,
      imageUrl: `https://static.wixstatic.com/media/${mediaId}~mv2.jpg`,
    }));

    const result = parseReviewedNovecentoSchedule(
      images,
      dateRange("2026-07-25", 38),
    );

    expect(result).toHaveLength(60);
    expect(result.at(-1)).toMatchObject({
      title: "ご近所さよならイベント",
      startsAt: "2026-08-30T05:00:00.000Z",
      format: "特別プログラム",
    });
  });
});
