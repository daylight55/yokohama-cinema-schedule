import { load } from "cheerio";
import { jstEndToIso, jstLocalToIso } from "../../../shared/date";
import { moviePreferenceKey, safeImageUrl } from "../../../shared/movie";
import type { NormalizedShowing } from "../../../shared/types";

export function parseUnitedSchedule(
  html: string,
  date: string,
  movieImages: ReadonlyMap<string, string> = new Map(),
): NormalizedShowing[] {
  const $ = load(html);
  const result: NormalizedShowing[] = [];

  $("li.clearfix").each((_, movieElement) => {
    const movie = $(movieElement);
    const title = cleanText(movie.find(".movieTitle").first().clone().children().remove().end().text()) ||
      cleanText(movie.find(".movieTitle a").first().text());
    if (!title || movie.find(".startTime").length === 0) return;
    const detailUrl = movie.find(".movieTitle a").first().attr("href") ?? "";
    const movieKey = detailUrl.match(/film=(\d+)/)?.[1] ?? title;

    movie.find("ul.tl > li").each((__, screenElement) => {
      const screen = $(screenElement);
      const screenAlt = screen.find(".screenNumber img").attr("alt") ?? "";
      const screenName =
        screenAlt.match(/(\d+)screen/i)?.[1] ??
        cleanText(screen.find(".screenNumber").text()) ??
        null;

      screen.find(".startTime").each((___, startElement) => {
        const startNode = $(startElement);
        const start = cleanText(startNode.text());
        const showBlock = startNode.closest("div");
        const end = cleanText(showBlock.find(".endTime").text()).replace(
          /^[～~]/,
          "",
        );
        const href = showBlock.find("a[href]").first().attr("href");
        const bookingUrl = href
          ? new URL(href, "https://www.unitedcinemas.jp").toString()
          : "https://www.unitedcinemas.jp/minatomirai/daily.php";

        result.push({
          sourceId: "united-minatomirai",
          cinemaId: "united-minatomirai",
          movieKey,
          title,
          imageUrl: movieImages.get(moviePreferenceKey(title)) ?? null,
          startsAt: jstLocalToIso(date, start),
          endsAt: end ? jstEndToIso(date, start, end) : null,
          screen: screenName ? `スクリーン${screenName}` : null,
          format: detectFormat(movie.text()),
          bookingUrl,
          purchasable: Boolean(href),
        });
      });
    });
  });

  return result;
}

export function parseUnitedMovieImages(html: string): Map<string, string> {
  const $ = load(html);
  const result = new Map<string, string>();
  $(".movieList > li").each((_, element) => {
    const movie = $(element);
    const title = cleanText(movie.find(".movieHead strong").first().text());
    const rawImageUrl = movie.find(".movieImage img").first().attr("src");
    const imageUrl = safeImageUrl(
      rawImageUrl
        ? new URL(rawImageUrl, "https://www.unitedcinemas.jp").toString()
        : null,
    );
    if (title && imageUrl) result.set(moviePreferenceKey(title), imageUrl);
  });
  return result;
}

function detectFormat(value: string): string | null {
  const labels = value.match(/字幕|吹替|IMAX|4DX|3D|2D|FLEXOUND/g);
  return labels ? [...new Set(labels)].join(" / ") : null;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
