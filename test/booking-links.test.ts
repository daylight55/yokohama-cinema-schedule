import { describe, expect, it } from "vitest";
import { parseTjoySchedule } from "../worker/src/parsers/tjoy";
import { parseTohoSchedule } from "../worker/src/parsers/toho";
import { parseAeonSchedule } from "../worker/src/parsers/aeon";
import { parseKinoSchedule } from "../worker/src/parsers/kino";
import { parseMovilSchedule } from "../worker/src/parsers/movil";
import { parseUnitedSchedule } from "../worker/src/parsers/united";
import { parseEigalandSchedule } from "../worker/src/parsers/eigaland";
import { resolveBookingUrl } from "../worker/src/parsers/booking";

const date = "2026-09-26";

describe("showing-specific booking links", () => {
  it.each(["yokohama_burg13", "t-joy_yokohama"])(
    "keeps distinct T-Joy performances and the fallback date for %s",
    (theater) => {
      const origin = `https://tjoy.jp/${theater}`;
      const rows = parseTjoySchedule(
        `<section class="section-container">
      <h2 class="js-title-film">マッチング TRUE LOVE</h2>
      <div class="schedule-box"><a href="/seat-map">座席表</a><p class="schedule-time">15:50 ～ 17:50</p>
        <div class="schedule-box-body" onclick="location.href ='/${theater}/reservation/index/2056662/C4840000/4/${date}?type=film'"></div></div>
      <div class="schedule-box"><p class="schedule-time">19:00 ～ 21:00</p>
        <div class="schedule-box-body"><p class="schedule-status" onclick="window.location.href ='/${theater}/reservation/index/2056653/C4840000/2/${date}?type=film'"></p></div></div>
      <div class="schedule-box"><p class="schedule-time">21:25 ～ 23:25</p>
        <div class="schedule-box-body" onclick="javascript:void(0);"></div></div>
      </section>`,
        date,
        theater,
        theater,
        origin,
      );
      expect(rows.map((row) => row.bookingUrl)).toEqual([
        `${origin}/reservation/index/2056662/C4840000/4/${date}?type=film`,
        `${origin}/reservation/index/2056653/C4840000/2/${date}?type=film`,
        `${origin}?date=${date}#schedule-content`,
      ]);
      expect(rows.map((row) => row.purchasable)).toEqual([true, true, false]);
    },
  );

  it("builds TOHO's official entry URL from cinema, film, screen, performance and date", () => {
    const rows = parseTohoSchedule(
      {
        status: "0",
        data: [
          {
            list: [
              {
                code: "066",
                list: [
                  {
                    code: "029165",
                    name: "マッチング TRUE LOVE",
                    list: [
                      {
                        code: "04",
                        theaterCd: "0661",
                        name: "スクリーン4",
                        list: [
                          {
                            code: 2,
                            showingStart: "11:35",
                            showingEnd: "13:35",
                            unsoldSeatInfo: { unsoldSeatStatus: "A" },
                          },
                          {
                            code: 4,
                            showingStart: "14:05",
                            showingEnd: "16:05",
                            unsoldSeatInfo: { unsoldSeatStatus: "B" },
                          },
                          {
                            code: 5,
                            showingStart: "16:30",
                            showingEnd: "18:30",
                            unsoldSeatInfo: { unsoldSeatStatus: "D" },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      date,
      "toho-kamiooka",
      "toho-kamiooka",
      "https://hlo.tohotheater.jp/net/schedule/066/TNPI2000J01.do",
    );
    const link = new URL(rows[0].bookingUrl);
    expect(link.origin + link.pathname).toBe(
      "https://hlo.tohotheater.jp/net/ticket/066/TNPI2040J03.do",
    );
    expect(Object.fromEntries(link.searchParams)).toEqual({
      site_cd: "066",
      jyoei_date: "20260926",
      gekijyo_cd: "0661",
      screen_cd: "04",
      sakuhin_cd: "029165",
      pf_no: "2",
      fnc: "1",
      pageid: "2000J01",
      enter_kbn: "",
    });
    expect(new URL(rows[1].bookingUrl).searchParams.get("pf_no")).toBe("4");
    expect(rows[2].bookingUrl).toBe(
      "https://hlo.tohotheater.jp/net/schedule/066/TNPI2000J01.do?show_day=20260926",
    );
    expect(rows[2].purchasable).toBe(false);
  });

  it("uses AEON's event ID rather than its film ID or schedule homepage", () => {
    const rows = parseAeonSchedule(
      {
        "20260926": {
          film: [
            {
              id: "6ab16279e0bb1ba0f1b9ffee",
              name: { ja: "白鳥とコウモリ" },
              startDate: "2026-09-26T08:10:00+09:00",
              superEvent: { id: "not-the-performance" },
            },
            {
              id: "6ab16279e0bb1ba0f1b9ffef",
              name: { ja: "白鳥とコウモリ" },
              startDate: "2026-09-26T13:10:00+09:00",
            },
            {
              name: { ja: "白鳥とコウモリ" },
              startDate: "2026-09-26T18:10:00+09:00",
            },
          ],
        },
      },
      new Set([date]),
    );
    expect(rows.map((row) => row.bookingUrl)).toEqual([
      "https://login.watatheatre.aeoncinema.com/auth?eventId=6ab16279e0bb1ba0f1b9ffee",
      "https://login.watatheatre.aeoncinema.com/auth?eventId=6ab16279e0bb1ba0f1b9ffef",
      "https://theater.aeoncinema.com/theaters/minatomirai/?date=20260926",
    ]);
  });

  it("never assigns another screening's booking link to an unavailable kino showing", () => {
    const rows = parseKinoSchedule(
      `<div class="schedule__day-btn"><button>9/26</button></div>
      <div class="schedule__item"><div class="schedule__movie"><h2 class="schedule__title">ナギダイアリー</h2>
      <div class="schedule__screen"><span class="schedule__screen-name">シアター2</span><ul>
      <li><div class="schedule__time"><em class="schedule__start-time">10:15</em><span class="schedule__end-time">- 12:10</span></div></li>
      <li><a href="https://app.eigaland.com/booking?&amp;scheduleId=6ab2216af3c78815a76cbdb0"><div class="schedule__time"><em class="schedule__start-time">13:15</em><span class="schedule__end-time">- 15:10</span></div></a></li>
      </ul></div></div></div>`,
      date,
    );
    expect(rows[0]).toMatchObject({
      bookingUrl: "https://kinocinema.jp/minatomirai/#schedule",
      purchasable: false,
    });
    expect(rows[1]).toMatchObject({
      bookingUrl:
        "https://app.eigaland.com/booking?&scheduleId=6ab2216af3c78815a76cbdb0",
      purchasable: true,
    });
  });

  it("preserves Movil's exact date, start time and screen in an HTML-escaped purchase URL", () => {
    const rows = parseMovilSchedule(
      `<article><h2>ヨコハマメリー</h2><ul class="timetable">
      <li class="check_date"><a href="https://cinema.109cinemas.net/cgi-bin/pc/resv/resv_shw_ppt.cgi?ttc=52680&amp;tsc=72&amp;tssc=75&amp;ymd=2026-09-26&amp;cs=&amp;stt=0915"><time class="start">09:15</time><time class="end">10:50</time><div class="available">購入</div></a></li>
      </ul></article>`,
      date,
    );
    expect(
      Object.fromEntries(new URL(rows[0].bookingUrl).searchParams),
    ).toEqual({
      ttc: "52680",
      tsc: "72",
      tssc: "75",
      ymd: date,
      cs: "",
      stt: "0915",
    });
    expect(rows[0].purchasable).toBe(true);
  });

  it("keeps United's per-performance URL and retains the day for unavailable times", () => {
    const rows = parseUnitedSchedule(
      `<li class="clearfix"><div class="movieTitle">ファーストライド</div><ul class="tl"><li>
      <div><ol><li class="startTime">09:20</li><li class="endTime">～11:29</li></ol><a href="/all/cc.php?tc=053&amp;sd=20260926&amp;sc=009&amp;st=20260926092000&amp;mc=25227">購入</a></div>
      <div><ol><li class="startTime">12:20</li><li class="endTime">～14:29</li></ol><a href="javascript:void(0)">販売前</a></div>
      </li></ul></li>`,
      date,
    );
    expect(rows[0].bookingUrl).toBe(
      "https://www.unitedcinemas.jp/all/cc.php?tc=053&sd=20260926&sc=009&st=20260926092000&mc=25227",
    );
    expect(rows[1]).toMatchObject({
      bookingUrl: `https://www.unitedcinemas.jp/minatomirai/daily.php?date=${date}`,
      purchasable: false,
    });
  });

  it.each(["jack-and-betty", "cinemarine"])(
    "preserves Eigaland schedule IDs for %s",
    (cinema) => {
      const rows = parseEigalandSchedule(
        [
          {
            movieDetail: { movieName: "作品" },
            houseList: [
              {
                showList: [
                  {
                    startTime: "2026-09-26T10:00:00+09:00",
                    ticketingUrl:
                      "https://app.eigaland.com/booking?&scheduleId=first",
                  },
                  {
                    startTime: "2026-09-26T12:00:00+09:00",
                    ticketingUrl:
                      "https://app.eigaland.com/booking?&scheduleId=second",
                  },
                ],
              },
            ],
          },
        ],
        cinema,
        cinema,
        "https://example.com/",
      );
      expect(
        rows.map((row) =>
          new URL(row.bookingUrl).searchParams.get("scheduleId"),
        ),
      ).toEqual(["first", "second"]);
    },
  );

  it("rejects non-navigation URLs and resolves relative web links", () => {
    for (const href of [
      undefined,
      "",
      "#",
      "javascript:void(0)",
      "data:text/html,unsafe",
      "https://name:password@example.com/",
    ])
      expect(
        resolveBookingUrl(href, "https://example.com/theater/"),
      ).toBeNull();
    expect(
      resolveBookingUrl("booking?show=1", "https://example.com/theater/"),
    ).toBe("https://example.com/theater/booking?show=1");
  });
});
