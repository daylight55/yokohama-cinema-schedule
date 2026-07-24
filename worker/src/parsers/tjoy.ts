import { load } from "cheerio";
import { jstEndToIso, jstLocalToIso } from "../../../shared/date";
import { safeImageUrl } from "../../../shared/movie";
import type { NormalizedShowing } from "../../../shared/types";

export function parseTjoySchedule(
  html: string,
  date: string,
  sourceId: string,
  cinemaId: string,
  origin: string,
): NormalizedShowing[] {
  const $ = load(html);
  const result: NormalizedShowing[] = [];

  $("section.section-container").each((_, sectionElement) => {
    const section = $(sectionElement);
    const rawTitle = cleanText(section.find(".js-title-film").first().text());
    const title = rawTitle.replace(/^【[^】]+】\s*/, "");
    if (!title) return;
    const detailOnclick =
      section.find("a[onclick*='cinema_detail']").first().attr("onclick") ?? "";
    const movieHref =
      section.find("a[href*='film_detail']").first().attr("href") ??
      detailOnclick.match(/['"]([^'"]*cinema_detail[^'"]*)['"]/)?.[1];
    const movieKey =
      movieHref?.match(/(?:film_detail|cinema_detail)\/([^/?#]+)/)?.[1] ??
      rawTitle;
    const rawImageUrl = section.find(".film-img img").first().attr("src");
    const imageUrl = safeImageUrl(
      rawImageUrl ? new URL(rawImageUrl, origin).toString() : null,
    );

    section.find(".schedule-box").each((__, boxElement) => {
      const box = $(boxElement);
      const timeText = cleanText(box.find(".schedule-time").first().text());
      const match = timeText.match(/(\d{1,2}:\d{2})\s*[～~]\s*(\d{1,2}:\d{2})/);
      if (!match) return;
      const screen =
        cleanText(box.find(".theater-name").first().text()) || null;
      const onclick = box.find(".schedule-box-body").attr("onclick") ?? "";
      const path = onclick.match(/location\.href\s*=\s*['"]([^'"]+)/)?.[1];
      const bookingUrl = path
        ? new URL(path, origin).toString()
        : `${origin}#schedule-content`;

      result.push({
        sourceId,
        cinemaId,
        movieKey,
        title,
        imageUrl,
        startsAt: jstLocalToIso(date, match[1]),
        endsAt: jstEndToIso(date, match[1], match[2]),
        screen,
        format: detectFormat(rawTitle),
        bookingUrl,
        purchasable: Boolean(path),
      });
    });
  });

  return result;
}

function detectFormat(title: string): string | null {
  const labels = title.match(
    /DolbyCinema|DolbyAtmos|SCREENX|IMAX|字幕|吹替|3D|2D/g,
  );
  return labels ? [...new Set(labels)].join(" / ") : null;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
