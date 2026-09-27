import type { Showing } from "../shared/types";
import { formatJstDate } from "../shared/date";
import { moviePreferenceKey } from "../shared/movie";
import { hashForAppView } from "./lib";
import { translate } from "../shared/i18n";
import type { Language } from "../shared/language";

export function MovieTimes({ showings, language = "ja", title }: { showings: Showing[]; language?: Language; title?: string }) {
  const t = (text: string) => translate(text, language);
  const time = new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <nav className="movie-times" data-horizontal-scroll={`movie:${showings[0] ? moviePreferenceKey(showings[0].title) : "empty"}`} aria-label={t("上映時刻")}>
      {[...showings].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.cinemaName.localeCompare(b.cinemaName)).map((s) => (
        <a key={s.id} href={hashForAppView("schedule", { date: formatJstDate(new Date(s.startsAt)), movie: moviePreferenceKey(s.title), showing: s.id })}
          aria-label={`${time.format(new Date(s.startsAt))} · ${t(s.cinemaName)} · ${title ?? s.title}`}>
          <time dateTime={s.startsAt}>{time.format(new Date(s.startsAt))}</time>
        </a>
      ))}
    </nav>
  );
}
