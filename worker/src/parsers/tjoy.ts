import { load } from "cheerio";
import { resolveBookingUrl } from "./booking";
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
  const schedule = $("#film").length ? $("#film") : $("html");
  const selectedDate = schedule
    .find(".calendar-active[data-date]")
    .first()
    .attr("data-date");
  if (selectedDate && selectedDate !== date)
    throw new Error("T-Joy returned a different schedule date");
  if (schedule.find(".calendar-item[data-date]").length && !selectedDate) {
    throw new Error("T-Joy selected schedule date is missing");
  }
  const sections = schedule.find("section.section-container");
  // A calendar alone can be a truncated or changed page. Only the site's
  // explicit unpublished notice is evidence of an empty schedule.
  if (
    !sections.length &&
    !(
      selectedDate === date &&
      schedule.find(".text-notify").text().includes("スケジュールは調整中")
    )
  ) {
    throw new Error("T-Joy schedule markup is missing");
  }

  sections.each((_, sectionElement) => {
    const section = $(sectionElement);
    const rawTitle = cleanText(section.find(".js-title-film").first().text());
    const title = rawTitle.replace(/^【[^】]+】\s*/, "");
    if (!title) throw new Error("T-Joy movie title is missing");
    if (!section.find(".schedule-box").length) {
      throw new Error("T-Joy movie schedule is missing");
    }
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
      // Reject the entire date: silently dropping a row would replace the
      // previous complete day with an incomplete schedule.
      if (!match) throw new Error("T-Joy showing time is invalid");
      const screen =
        cleanText(box.find(".theater-name").first().text()) || null;
      const reservationNodes = box.find(
        ".schedule-box-body, .schedule-status, .schedule-box-body a[href], .schedule-status a[href]",
      );
      let directBookingUrl: string | null = null;
      for (const node of reservationNodes.toArray()) {
        const element = $(node);
        const onclick = element.attr("onclick") ?? "";
        const path = onclick.match(/location\.href\s*=\s*['"]([^'"]+)/)?.[1];
        directBookingUrl = resolveBookingUrl(
          path ?? element.attr("href"),
          origin,
        );
        if (directBookingUrl) break;
      }
      const fallback = new URL(origin);
      fallback.searchParams.set("date", date);
      fallback.hash = "schedule-content";
      const bookingUrl = directBookingUrl ?? fallback.toString();

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
        purchasable: Boolean(directBookingUrl),
      });
    });
  });

  if (result.length !== schedule.find(".schedule-box").length) {
    throw new Error("T-Joy schedule contains unparsed showings");
  }
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
