import { load } from "cheerio";
import { jstEndToIso, jstLocalToIso } from "../../../shared/date";
import type { NormalizedShowing } from "../../../shared/types";

export function parseMovilSchedule(
  html: string,
  date: string,
): NormalizedShowing[] {
  const $ = load(html);
  const result: NormalizedShowing[] = [];

  $("article").each((_, element) => {
    const article = $(element);
    const title = cleanText(article.find("h2").first().text());
    if (!title) return;
    const movieKey = article.attr("class")?.split(/\s+/)[0] ?? title;

    article.find("ul.timetable").each((__, timetableElement) => {
      const timetable = $(timetableElement);
      const theatreText = cleanText(timetable.find("li.theatre").first().text());
      const screen =
        cleanText(timetable.find(".theatre-num").first().text()) || null;
      const format = theatreText.match(/\b(2D|3D|4DX|IMAX)\b/i)?.[1] ?? null;

      timetable.find("li.check_date").each((___, showElement) => {
        const show = $(showElement);
        const start = cleanText(show.find("time.start").text());
        const end = cleanText(show.find("time.end").text());
        if (!start) return;
        const bookingUrl =
          show.find("a[href]").first().attr("href") ??
          "https://109cinemas.net/movil/";

        result.push({
          sourceId: "movil",
          cinemaId: "movil",
          movieKey,
          title,
          startsAt: jstLocalToIso(date, start),
          endsAt: end ? jstEndToIso(date, start, end) : null,
          screen: screen ? `ムービル${screen}` : theatreText || null,
          format,
          bookingUrl,
          purchasable: show.find(".available").length > 0,
        });
      });
    });
  });

  return result;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
