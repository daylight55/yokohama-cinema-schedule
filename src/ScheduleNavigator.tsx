import { useRef, type ReactNode } from "react";
import { ArrowsLeftRightIcon, CalendarDotsIcon, FilmSlateIcon, UsersThreeIcon, XIcon } from "@phosphor-icons/react";
import { hashForAppView, type AppView } from "./lib";
import { localize as t, localizedDate } from "./i18n";

const destinations = [
  { view: "schedule", label: "時間順", Icon: CalendarDotsIcon },
  { view: "movies", label: "作品別", Icon: FilmSlateIcon },
  { view: "shared", label: "共有の気になる", Icon: UsersThreeIcon },
  { view: "viewingPlans", label: "鑑賞予定", Icon: CalendarDotsIcon },
] as const;

export function ScheduleNavigator({ view, dates, selectedDate, query, locationAction, locationStatus }: {
  view: AppView;
  dates: string[];
  selectedDate: string;
  query: string;
  locationAction?: ReactNode;
  locationStatus?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();
  const dateView = view === "movies" ? "movies" : "schedule";
  return <>
    <button type="button" className="schedule-navigator-button" aria-haspopup="dialog"
      aria-controls="schedule-navigator" onClick={() => dialogRef.current?.showModal()}>
      <ArrowsLeftRightIcon size={20} aria-hidden="true" />{t("スケジュールを切替")}
    </button>
    <dialog id="schedule-navigator" ref={dialogRef} className="movie-preference-dialog schedule-navigator-dialog"
      closedby="any" aria-labelledby="schedule-navigator-title"
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}>
      <div className="movie-preference-sheet">
        <div className="movie-preference-heading">
          <h2 id="schedule-navigator-title">{t("スケジュールを切替")}</h2>
          <button type="button" className="icon-button" aria-label={t("閉じる")} onClick={close}><XIcon size={20} aria-hidden="true" /></button>
        </div>
        <nav className="schedule-destinations" aria-label={t("スケジュールの表示")}>
          {destinations.map(({ view: target, label, Icon }) => <a key={target}
            href={hashForAppView(target, { date: selectedDate, query: target === "schedule" || target === "movies" ? query : undefined })}
            aria-current={target === view ? "page" : undefined} onClick={close}>
            <Icon size={20} aria-hidden="true" />{t(label)}
          </a>)}
        </nav>
        <nav className="schedule-jump-dates" aria-label={t("上映日")}>
          {dates.map((date, index) => <a key={date}
            href={hashForAppView(dateView, { date, query })}
            aria-current={(view === "schedule" || view === "movies") && date === selectedDate ? "date" : undefined}
            onClick={close}>
            {index === 0 ? t("今日") : localizedDate({ month: "numeric", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00+09:00`))}
          </a>)}
        </nav>
        {locationAction && <div className="schedule-location-action">
          {locationAction}
          {locationStatus && <p role="status">{locationStatus}</p>}
        </div>}
      </div>
    </dialog>
  </>;
}
