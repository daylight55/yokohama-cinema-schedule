import { load } from "cheerio";
import { resolveBookingUrl } from "./booking";
import { addDays, jstEndToIso, jstLocalToIso } from "../../../shared/date";
import type { NormalizedShowing } from "../../../shared/types";
import { safeImageUrl } from "../../../shared/movie";

export function parseKinoSchedule(
  html: string,
  firstDate: string,
  movieImages: ReadonlyMap<string, string> = new Map(),
): NormalizedShowing[] {
  const $ = load(html);
  const buttons = $(".schedule__day-btn button");
  if (!buttons.length || !$(".schedule__container, .schedule__item").length)
    throw new Error("Kino schedule markup is missing");
  const dates = buttons
    .map((index, button) => {
      const label = $(button).attr("aria-label") ?? $(button).text();
      const match = label.match(/(\d{1,2})[月/](\d{1,2})/);
      if (!match) return addDays(firstDate, index);
      const year = Number(firstDate.slice(0, 4));
      const suffix = `${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
      return [year - 1, year, year + 1]
        .map((y) => `${y}-${suffix}`)
        .sort(
          (a, b) =>
            Math.abs(Date.parse(a) - Date.parse(firstDate)) -
            Math.abs(Date.parse(b) - Date.parse(firstDate)),
        )[0];
    })
    .get();
  const result: NormalizedShowing[] = [];

  $(".schedule__item").each((dayIndex, itemElement) => {
    const date = dates[dayIndex];
    if (!date) return;
    const item = $(itemElement);

    item.find(".schedule__movie").each((_, movieElement) => {
      const movie = $(movieElement);
      const rawTitle = cleanText(movie.find(".schedule__title").first().text());
      const title = rawTitle.replace(/^NEW\s*/, "");
      if (!title) return;
      const detailUrl = movie.find(".schedule__title a").first().attr("href");
      const movieKey = detailUrl?.match(/movie-detail\/(\d+)/)?.[1] ?? title;

      movie.find(".schedule__screen").each((__, screenElement) => {
        const screen = $(screenElement);
        const screenName =
          cleanText(screen.find(".schedule__screen-name").first().text())
            .replace(/\d+席.*$/, "")
            .trim() || null;

        screen.find(".schedule__time").each((___, timeElement) => {
          const time = $(timeElement);
          const start = cleanText(time.find(".schedule__start-time").text());
          const end = cleanText(
            time.find(".schedule__end-time").text(),
          ).replace(/^-\s*/, "");
          if (!start) return;
          const showContainer = time.closest("li");
          const directBookingUrl = resolveBookingUrl(
            showContainer.find("a[href*='booking']").first().attr("href"),
            "https://kinocinema.jp/minatomirai/",
          );
          // Never borrow the first bookable time from another showing of this film.
          const bookingUrl =
            directBookingUrl ?? "https://kinocinema.jp/minatomirai/#schedule";

          result.push({
            sourceId: "kino-minatomirai",
            cinemaId: "kino-minatomirai",
            movieKey,
            title,
            imageUrl: movieImages.get(movieKey) ?? null,
            startsAt: jstLocalToIso(date, start),
            endsAt: end ? jstEndToIso(date, start, end) : null,
            screen: screenName,
            format: detectFormat(rawTitle),
            bookingUrl,
            purchasable: Boolean(directBookingUrl),
          });
        });
      });
    });
  });

  return result;
}

export function parseKinoMovieImages(html: string): Map<string, string> {
  const $ = load(html);
  const result = new Map<string, string>();
  $(".movie-list__item").each((_, element) => {
    const item = $(element);
    const detailUrl = item.find("a[href*='movie-detail']").first().attr("href");
    const movieKey = detailUrl?.match(/movie-detail\/(\d+)/)?.[1];
    const style = item.find(".movie-list__img").first().attr("style") ?? "";
    const imagePath = style.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1];
    if (!movieKey || !imagePath) return;
    const imageUrl = safeImageUrl(
      new URL(imagePath, "https://kinocinema.jp").toString(),
    );
    if (imageUrl) result.set(movieKey, imageUrl);
  });
  return result;
}

function detectFormat(title: string): string | null {
  const labels = title.match(/字幕|吹替|4K|3D|2D/g);
  return labels ? [...new Set(labels)].join(" / ") : null;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
