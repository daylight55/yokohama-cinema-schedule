import { addDays, todayInJst } from "../shared/date";
import { moviePreferenceKey } from "../shared/movie";
import type {
  CinemaArea,
  RouteEstimate,
  Showing,
} from "../shared/types";

export const AREA_OPTIONS: Array<{
  id: CinemaArea | "all";
  label: string;
}> = [
  { id: "all", label: "すべて" },
  { id: "yokohama", label: "横浜駅" },
  { id: "minatomirai", label: "桜木町・みなとみらい" },
  { id: "kannai", label: "関内・伊勢佐木町" },
  { id: "tobe", label: "戸部" },
];

export function buildDates(now = new Date(), days = 7): string[] {
  const today = todayInJst(now);
  return Array.from({ length: days }, (_, index) => addDays(today, index));
}

export function isShowingReachable(
  showing: Pick<Showing, "startsAt" | "cinemaId">,
  now: Date,
  routeByCinema: Map<string, RouteEstimate>,
  preparationMinutes = 10,
  reachableWindowMinutes = 60,
): boolean {
  const route = routeByCinema.get(showing.cinemaId);
  const travelMinutes = route?.durationMinutes ?? 0;
  const startsInMinutes =
    (new Date(showing.startsAt).getTime() - now.getTime()) / 60_000;
  return (
    startsInMinutes >= travelMinutes + preparationMinutes &&
    startsInMinutes <= reachableWindowMinutes
  );
}

export function isShowingPast(
  showing: Pick<Showing, "startsAt">,
  now: Date,
): boolean {
  return new Date(showing.startsAt).getTime() < now.getTime();
}

export function filterShowings(
  showings: Showing[],
  options: {
    selectedArea: CinemaArea | "all";
    futureOnly: boolean;
    now: Date;
  },
): Showing[] {
  return showings.filter((showing) => {
    if (
      options.selectedArea !== "all" &&
      showing.area !== options.selectedArea
    ) {
      return false;
    }
    return (
      !options.futureOnly ||
      new Date(showing.startsAt).getTime() >= options.now.getTime()
    );
  });
}

export function groupByMovie(showings: Showing[]): Array<{
  key: string;
  preferenceKey: string;
  title: string;
  imageUrl: string | null;
  showings: Showing[];
}> {
  const groups = new Map<string, Showing[]>();
  for (const showing of showings) {
    const key = normalizeMovieTitle(showing.title);
    groups.set(key, [...(groups.get(key) ?? []), showing]);
  }
  return [...groups.entries()]
    .map(([key, entries]) => ({
      key,
      preferenceKey: key,
      title: entries[0].title,
      imageUrl:
        entries.find((showing) => showing.imageUrl)?.imageUrl ?? null,
      showings: entries.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }))
    .sort((a, b) => {
      const firstA = a.showings[0]?.startsAt ?? "";
      const firstB = b.showings[0]?.startsAt ?? "";
      return firstA.localeCompare(firstB) || a.title.localeCompare(b.title, "ja");
    });
}

export interface ScheduleTimeGroup {
  time: string;
  label: string;
  movies: ReturnType<typeof groupByMovie>;
  showingCount: number;
}

const jstTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function scheduleTimeSlot(date: Date): string {
  const parts = jstTimeFormatter.formatToParts(date);
  const hour =
    parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

export function groupByScheduleTime(showings: Showing[]): ScheduleTimeGroup[] {
  const slots = new Map<string, Showing[]>();
  for (const showing of showings) {
    const time = scheduleTimeSlot(new Date(showing.startsAt));
    slots.set(time, [...(slots.get(time) ?? []), showing]);
  }
  return [...slots.entries()]
    .sort(([timeA], [timeB]) => timeA.localeCompare(timeB))
    .map(([time, entries]) => ({
      time,
      label: time,
      movies: groupByMovie(entries),
      showingCount: entries.length,
    }));
}

export function findCurrentTimeMarkerIndex(
  groups: Array<Pick<ScheduleTimeGroup, "time">>,
  now: Date,
): number {
  const currentSlot = scheduleTimeSlot(now);
  return groups.findIndex((group) => group.time >= currentSlot);
}

export function scrollToInitialTimeMarker(
  marker: {
    scrollIntoView(options: {
      behavior: "instant";
      block: "start";
    }): void;
  },
): void {
  marker.scrollIntoView({ behavior: "instant", block: "start" });
}

export function normalizeMovieTitle(title: string): string {
  return moviePreferenceKey(title);
}
