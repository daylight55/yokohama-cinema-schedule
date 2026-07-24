import { load } from "cheerio";
import { jstEndToIso, jstLocalToIso } from "../../../shared/date";
import { moviePreferenceKey, safeImageUrl } from "../../../shared/movie";
import type { NormalizedShowing } from "../../../shared/types";

export function parseMovilSchedule(
  html: string,
  date: string,
  movieImages: ReadonlyMap<string, string> = new Map(),
): NormalizedShowing[] {
  const $ = load(html);
  const result: NormalizedShowing[] = [];

  $("article").each((_, element) => {
    const article = $(element);
    const title = cleanText(article.find("h2").first().text());
    if (!title) return;
    const detailUrl = article.find("header a[href*='/movies/']").attr("href");
    const movieKey =
      detailUrl?.match(/\/movies\/(\d+)/)?.[1] ??
      article.attr("class")?.split(/\s+/)[0] ??
      title;

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
          imageUrl: movieImages.get(moviePreferenceKey(title)) ?? null,
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

export function parseMovilMovieImages(html: string): Map<string, string> {
  const $ = load(html);
  const result = new Map<string, string>();
  $(".movies-list-movie").each((_, element) => {
    const movie = $(element);
    const title = cleanText(
      movie.find(".main h1, .main h2, .main h3, .title").first().text() ||
        movie.find("img").first().attr("alt") ||
        "",
    );
    const imagePath = movie.find(".thumb img, img").first().attr("src");
    if (!title || !imagePath) return;
    const imageUrl = safeImageUrl(
      new URL(imagePath, "https://109cinemas.net").toString(),
    );
    if (imageUrl) result.set(moviePreferenceKey(title), imageUrl);
  });
  return result;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
