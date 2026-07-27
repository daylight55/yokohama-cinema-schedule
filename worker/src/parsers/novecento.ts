import { load } from "cheerio";
import { jstLocalToIso } from "../../../shared/date";
import { moviePreferenceKey } from "../../../shared/movie";
import type { NormalizedShowing } from "../../../shared/types";

const SOURCE_ID = "novecento";
const CINEMA_ID = "novecento";
const SCHEDULE_URL =
  "https://cinema1900.wixsite.com/home/filmtheater1900";

export interface NovecentoScheduleImage {
  weekStart: string;
  imageUrl: string;
}

interface ReviewedScreening {
  date: string;
  startTime: string;
  title: string;
  format?: "特別プログラム" | "マサラ上映";
}

interface ReviewedWeek {
  imageUrl: string;
  screenings: ReviewedScreening[];
}

const REVIEWED_WEEKS: Record<string, ReviewedWeek> = {
  "2026-07-25": {
    imageUrl:
      "https://static.wixstatic.com/media/ac9ab3_f1a0e00eb51540c49e425238990e774c~mv2.jpg",
    screenings: [
      {
        date: "2026-07-25",
        startTime: "13:30",
        title: "河童のクゥと夏休み",
        format: "特別プログラム",
      },
      {
        date: "2026-07-26",
        startTime: "11:00",
        title: "河童のクゥと夏休み",
      },
      {
        date: "2026-07-26",
        startTime: "14:00",
        title: "龍帝外伝Ⅴ 激闘篇",
        format: "特別プログラム",
      },
    ],
  },
  "2026-08-01": {
    imageUrl:
      "https://static.wixstatic.com/media/ac9ab3_4050f57d0faf4d08a2bb27179832e237~mv2.jpg",
    screenings: [
      {
        date: "2026-08-01",
        startTime: "11:45",
        title: "POCA PON ポカポン",
      },
      {
        date: "2026-08-01",
        startTime: "15:10",
        title: "ヘブンズベル",
        format: "特別プログラム",
      },
      {
        date: "2026-08-02",
        startTime: "11:30",
        title: "ヘブンズベル",
      },
      {
        date: "2026-08-02",
        startTime: "14:00",
        title: "POCA PON ポカポン",
        format: "特別プログラム",
      },
      {
        date: "2026-08-03",
        startTime: "11:45",
        title: "メイヤラガン 美しき人",
        format: "マサラ上映",
      },
      {
        date: "2026-08-03",
        startTime: "15:10",
        title: "バイヤー青年",
        format: "マサラ上映",
      },
      {
        date: "2026-08-03",
        startTime: "18:00",
        title: "サルダール",
        format: "マサラ上映",
      },
      {
        date: "2026-08-05",
        startTime: "12:15",
        title: "ラストファーマー",
      },
      {
        date: "2026-08-05",
        startTime: "15:10",
        title: "スルターン",
      },
      {
        date: "2026-08-05",
        startTime: "18:00",
        title: "バイヤー青年",
      },
      {
        date: "2026-08-06",
        startTime: "12:15",
        title: "ボンブ-神の音",
      },
      {
        date: "2026-08-06",
        startTime: "15:10",
        title: "そっとお休み",
      },
      {
        date: "2026-08-06",
        startTime: "18:00",
        title: "マーリーサン-幻術師",
      },
      {
        date: "2026-08-07",
        startTime: "12:15",
        title: "ジャイ・ビーム",
      },
      {
        date: "2026-08-07",
        startTime: "15:10",
        title: "ただ空高く舞え",
      },
      {
        date: "2026-08-07",
        startTime: "18:00",
        title: "Mr ハンサム",
      },
    ],
  },
  "2026-08-08": {
    imageUrl:
      "https://static.wixstatic.com/media/ac9ab3_2d3a7b1e04d34ce5bc1d2e0455f63a4c~mv2.jpg",
    screenings: [
      {
        date: "2026-08-08",
        startTime: "09:00",
        title: "そっとお休み",
        format: "マサラ上映",
      },
      {
        date: "2026-08-08",
        startTime: "12:00",
        title: "あぶない刑事40周年記念イベント⑨",
        format: "特別プログラム",
      },
      {
        date: "2026-08-09",
        startTime: "09:00",
        title: "ボンブ-神の音",
        format: "マサラ上映",
      },
      {
        date: "2026-08-09",
        startTime: "12:00",
        title: "あぶない刑事40周年記念イベント⑨",
        format: "特別プログラム",
      },
      {
        date: "2026-08-11",
        startTime: "11:00",
        title: "マーリーサン-幻術師",
        format: "マサラ上映",
      },
      {
        date: "2026-08-11",
        startTime: "14:00",
        title: "特撮同好会",
        format: "特別プログラム",
      },
      {
        date: "2026-08-12",
        startTime: "12:00",
        title: "ヴィクラムとヴェーダ",
      },
      {
        date: "2026-08-12",
        startTime: "15:00",
        title: "イレブン",
      },
      {
        date: "2026-08-12",
        startTime: "18:00",
        title: "ラストファーマー",
      },
      {
        date: "2026-08-13",
        startTime: "12:00",
        title: "24",
        format: "マサラ上映",
      },
      {
        date: "2026-08-13",
        startTime: "15:00",
        title: "盲目の目撃者",
        format: "マサラ上映",
      },
      {
        date: "2026-08-13",
        startTime: "18:00",
        title: "イレブン",
        format: "マサラ上映",
      },
      {
        date: "2026-08-14",
        startTime: "12:00",
        title: "サルダール",
        format: "マサラ上映",
      },
      {
        date: "2026-08-14",
        startTime: "15:00",
        title: "バイヤー青年",
        format: "マサラ上映",
      },
      {
        date: "2026-08-14",
        startTime: "18:00",
        title: "ボンブ-神の音",
        format: "マサラ上映",
      },
    ],
  },
  "2026-08-15": {
    imageUrl:
      "https://static.wixstatic.com/media/ac9ab3_bdea276044ba4e11a6cb0e9ee662b097~mv2.jpg",
    screenings: [
      {
        date: "2026-08-15",
        startTime: "10:00",
        title: "RRR",
        format: "マサラ上映",
      },
      {
        date: "2026-08-15",
        startTime: "14:00",
        title: "デーヴァラ",
        format: "マサラ上映",
      },
      {
        date: "2026-08-15",
        startTime: "17:30",
        title: "WAR／バトル・オブ・デスティニー",
        format: "マサラ上映",
      },
      {
        date: "2026-08-16",
        startTime: "10:00",
        title: "RRR",
        format: "マサラ上映",
      },
      {
        date: "2026-08-16",
        startTime: "14:00",
        title: "デーヴァラ",
        format: "マサラ上映",
      },
      {
        date: "2026-08-16",
        startTime: "17:30",
        title: "ヴィクラム",
        format: "マサラ上映",
      },
      ...["19", "20", "21"].flatMap((day) => [
        {
          date: `2026-08-${day}`,
          startTime: "16:00",
          title: "ソーゾク",
        },
        {
          date: `2026-08-${day}`,
          startTime: "18:00",
          title: "愛とゆるしとピースの欠片",
        },
      ]),
    ],
  },
  "2026-08-22": {
    imageUrl:
      "https://static.wixstatic.com/media/ac9ab3_180c348048004c52b519bb28f9927361~mv2.jpg",
    screenings: [
      {
        date: "2026-08-23",
        startTime: "11:00",
        title: "ソーゾク",
      },
      {
        date: "2026-08-23",
        startTime: "14:00",
        title: "愛とゆるしとピースの欠片",
        format: "特別プログラム",
      },
      ...["26", "27", "28"].flatMap((day) => [
        {
          date: `2026-08-${day}`,
          startTime: "16:10",
          title: "カラオケや兆治",
        },
        {
          date: `2026-08-${day}`,
          startTime: "18:00",
          title: "SWANEE 野毛探偵事務所",
        },
      ]),
    ],
  },
  "2026-08-29": {
    imageUrl:
      "https://static.wixstatic.com/media/ac9ab3_943a218121bc46dd92333e1edae5ac86~mv2.jpg",
    screenings: [
      {
        date: "2026-08-29",
        startTime: "10:00",
        title: "カラオケや兆治",
      },
      {
        date: "2026-08-29",
        startTime: "11:45",
        title: "SWANEE 野毛探偵事務所",
      },
      {
        date: "2026-08-29",
        startTime: "14:00",
        title: "怪獣天国",
        format: "特別プログラム",
      },
      {
        date: "2026-08-30",
        startTime: "10:00",
        title: "カラオケや兆治",
      },
      {
        date: "2026-08-30",
        startTime: "11:45",
        title: "SWANEE 野毛探偵事務所",
      },
      {
        date: "2026-08-30",
        startTime: "14:00",
        title: "ご近所さよならイベント",
        format: "特別プログラム",
      },
    ],
  },
};

export function parseNovecentoScheduleImages(
  html: string,
  requestedDates: string[],
): NovecentoScheduleImage[] {
  if (requestedDates.length === 0) return [];

  const years = [
    ...new Set(
      [
        ...html.matchAll(/(20\d{2})年\d{1,2}月\d{1,2}日/g),
      ].map((match) => Number(match[1])),
    ),
  ];
  if (years.length === 0) {
    years.push(Number(requestedDates[0].slice(0, 4)));
  }

  const requested = new Set(requestedDates);
  const $ = load(html);
  const images: NovecentoScheduleImage[] = [];

  $("img").each((_index, element) => {
    const image = $(element);
    const alt = image.attr("alt")?.trim() ?? "";
    const stem = alt.match(/^(\d{2,4})\.jpe?g$/i)?.[1];
    if (!stem || image.attr("width") !== "600") return;

    const monthDay = parseCompactMonthDay(stem);
    if (!monthDay) return;

    const src = image.attr("src") ?? "";
    if (!src.includes("static.wixstatic.com/media/")) return;
    const imageUrl = src.split("/v1/")[0];

    for (const year of years) {
      const weekStart = [
        year,
        String(monthDay.month).padStart(2, "0"),
        String(monthDay.day).padStart(2, "0"),
      ].join("-");
      if (!weekOverlapsRequestedDates(weekStart, requested)) continue;
      images.push({ weekStart, imageUrl });
      break;
    }
  });

  return [
    ...new Map(images.map((image) => [image.imageUrl, image])).values(),
  ].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function parseReviewedNovecentoSchedule(
  images: NovecentoScheduleImage[],
  requestedDates: string[],
): NormalizedShowing[] {
  const requested = new Set(requestedDates);
  const showings: NormalizedShowing[] = [];

  for (const image of images) {
    const reviewed = REVIEWED_WEEKS[image.weekStart];
    if (!reviewed || reviewed.imageUrl !== image.imageUrl) {
      throw new Error(
        `未確認のノヴェチェント週間表です: ${image.weekStart}`,
      );
    }
    for (const screening of reviewed.screenings) {
      if (!requested.has(screening.date)) continue;
      showings.push({
        sourceId: SOURCE_ID,
        cinemaId: CINEMA_ID,
        movieKey: moviePreferenceKey(screening.title),
        title: screening.title,
        imageUrl: null,
        startsAt: jstLocalToIso(screening.date, screening.startTime),
        endsAt: null,
        screen: "1",
        format: screening.format ?? null,
        bookingUrl: SCHEDULE_URL,
        purchasable: null,
      });
    }
  }

  return showings.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function parseCompactMonthDay(
  value: string,
): { month: number; day: number } | null {
  for (let monthDigits = 1; monthDigits <= 2; monthDigits += 1) {
    if (value.length <= monthDigits) continue;
    const month = Number(value.slice(0, monthDigits));
    const day = Number(value.slice(monthDigits));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { month, day };
    }
  }
  return null;
}

function weekOverlapsRequestedDates(
  weekStart: string,
  requested: Set<string>,
): boolean {
  const start = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return false;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    if (requested.has(date.toISOString().slice(0, 10))) return true;
  }
  return false;
}
