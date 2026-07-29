import { addDays, formatJstDate, todayInJst } from "../shared/date";
import { moviePreferenceKey } from "../shared/movie";
import { normalizeSearchQuery } from "../shared/search";
import type {
  Cinema,
  CinemaArea,
  RouteEstimate,
  ScheduleCollapseMinutes,
  Showing,
} from "../shared/types";
export { buildGoogleMapsDirectionsUrl } from "../shared/maps";

export type ColorTheme = "light" | "dark";

export const COLOR_THEME_STORAGE_KEY = "hamamubi-color-theme";

export function parseColorTheme(value: unknown): ColorTheme | null {
  return value === "light" || value === "dark" ? value : null;
}

export function resolveColorTheme(
  storedTheme: unknown,
  prefersDark: boolean,
): ColorTheme {
  return parseColorTheme(storedTheme) ?? (prefersDark ? "dark" : "light");
}

export function colorThemeToggleLabel(theme: ColorTheme): string {
  return theme === "dark"
    ? "ライトモードに切り替える"
    : "ダークモードに切り替える";
}

export type AppView =
  | "schedule"
  | "movies"
  | "cinemas"
  | "planner"
  | "account"
  | "about";

export type AppPageScrollTarget = "top" | "current-time" | "linked-movie";

export function getAppPageScrollTarget(
  view: AppView,
  selectedDate: string,
  today: string,
  selectedMovieKey: string | null,
): AppPageScrollTarget {
  if (
    selectedMovieKey &&
    (view === "schedule" || view === "movies")
  ) {
    return "linked-movie";
  }
  if (view === "schedule" && selectedDate === today) {
    return "current-time";
  }
  return "top";
}

export function scrollPageToTop(scroller: {
  scrollTo(options: {
    top: number;
    left: number;
    behavior: "instant";
  }): void;
}): void {
  scroller.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

const APP_VIEW_BY_HASH: Record<string, AppView> = {
  "#schedule": "schedule",
  "#movies": "movies",
  "#cinemas": "cinemas",
  "#planner": "planner",
  "#profile": "account",
  "#account": "account",
  "#about": "about",
};

const HASH_BY_APP_VIEW: Record<AppView, string> = {
  schedule: "#schedule",
  movies: "#movies",
  cinemas: "#cinemas",
  planner: "#planner",
  account: "#account",
  about: "#about",
};

export interface AppHashState {
  view: AppView;
  date: string | null;
  movie: string | null;
  query: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function appHashStateFromHash(hash: string): AppHashState {
  const [routeHash = "", query = ""] = hash.split("?", 2);
  const view = APP_VIEW_BY_HASH[routeHash.toLowerCase()] ?? "schedule";
  const params = new URLSearchParams(query);
  const date = params.get("date");
  const movie = params.get("movie")?.trim();
  return {
    view,
    date: date && ISO_DATE_PATTERN.test(date) ? date : null,
    movie: movie ? movie.slice(0, 240) : null,
    query: normalizeSearchQuery(params.get("q")),
  };
}

export function appViewFromHash(hash: string): AppView {
  return appHashStateFromHash(hash).view;
}

export function hashForAppView(
  view: AppView,
  state: {
    date?: string | null;
    movie?: string | null;
    query?: string | null;
  } = {},
): string {
  const params = new URLSearchParams();
  if (state.date && ISO_DATE_PATTERN.test(state.date)) {
    params.set("date", state.date);
  }
  if (state.movie?.trim()) {
    params.set("movie", state.movie.trim().slice(0, 240));
  }
  const searchQuery = normalizeSearchQuery(state.query);
  if (searchQuery) {
    params.set("q", searchQuery);
  }
  const query = params.toString();
  return `${HASH_BY_APP_VIEW[view]}${query ? `?${query}` : ""}`;
}

export const AREA_OPTIONS: Array<{
  id: CinemaArea | "all";
  label: string;
}> = [
  { id: "all", label: "すべて" },
  { id: "yokohama", label: "横浜駅" },
  { id: "minatomirai", label: "桜木町・みなとみらい" },
  { id: "kannai", label: "関内・伊勢佐木町" },
  { id: "tobe", label: "戸部" },
  { id: "kamiooka", label: "上大岡" },
];

export const MOVIE_HIDE_CONFIRMATION =
  "上映スケジュールから非表示になりますが、よいですか？";

export function formatReachableLabel(travelMinutes: number): string {
  return `間に合う・移動${travelMinutes}分`;
}

export type DateSwipeDirection = "previous" | "next";

export function getDateSwipeDirection(
  deltaX: number,
  deltaY: number,
  minimumDistance = 64,
): DateSwipeDirection | null {
  const horizontalDistance = Math.abs(deltaX);
  if (
    horizontalDistance < minimumDistance ||
    horizontalDistance <= Math.abs(deltaY) * 1.25
  ) {
    return null;
  }
  return deltaX < 0 ? "next" : "previous";
}

export function buildMovieExternalLinks(title: string): {
  eiga: string;
  filmarks: string;
} {
  const eiga = new URL("https://eiga.com/search/");
  eiga.searchParams.set("t", title);
  const filmarks = new URL("https://filmarks.com/search/movies");
  filmarks.searchParams.set("q", title);
  return { eiga: eiga.toString(), filmarks: filmarks.toString() };
}

export function buildDates(now = new Date(), days = 7): string[] {
  const today = todayInJst(now);
  return Array.from({ length: days }, (_, index) => addDays(today, index));
}

const DEFAULT_ARRIVAL_MARGIN_MINUTES = 20;
// Route durations already include mode-specific or user-adjusted buffers.
// Keep only five additional minutes before a showing is considered reachable.
const DEFAULT_MARGIN_TOLERANCE_MINUTES = 15;

export function isShowingReachable(
  showing: Pick<Showing, "startsAt" | "cinemaId">,
  now: Date,
  routeByCinema: Map<string, RouteEstimate>,
  arrivalMarginMinutes = DEFAULT_ARRIVAL_MARGIN_MINUTES,
  marginToleranceMinutes = DEFAULT_MARGIN_TOLERANCE_MINUTES,
): boolean {
  return (
    getShowingReachability(
      showing,
      now,
      routeByCinema,
      arrivalMarginMinutes,
      marginToleranceMinutes,
    ) === "reachable"
  );
}

export type ShowingReachability =
  | "past"
  | "unknown"
  | "unreachable"
  | "reachable";

export function getShowingReachability(
  showing: Pick<Showing, "startsAt" | "cinemaId">,
  now: Date,
  routeByCinema: Map<string, RouteEstimate>,
  arrivalMarginMinutes = DEFAULT_ARRIVAL_MARGIN_MINUTES,
  marginToleranceMinutes = DEFAULT_MARGIN_TOLERANCE_MINUTES,
): ShowingReachability {
  if (isShowingPast(showing, now)) {
    return "past";
  }
  const route = routeByCinema.get(showing.cinemaId);
  if (!route) {
    return "unknown";
  }
  const targetStartMinutes = route.durationMinutes + arrivalMarginMinutes;
  const earliestStartMinutes =
    targetStartMinutes - marginToleranceMinutes;
  const startsInMinutes =
    (new Date(showing.startsAt).getTime() - now.getTime()) / 60_000;

  if (startsInMinutes < earliestStartMinutes) {
    return "unreachable";
  }
  return "reachable";
}

export function isShowingUnreachable(
  showing: Pick<Showing, "startsAt" | "cinemaId">,
  now: Date,
  routeByCinema: Map<string, RouteEstimate>,
  arrivalMarginMinutes = DEFAULT_ARRIVAL_MARGIN_MINUTES,
  marginToleranceMinutes = DEFAULT_MARGIN_TOLERANCE_MINUTES,
): boolean {
  return (
    getShowingReachability(
      showing,
      now,
      routeByCinema,
      arrivalMarginMinutes,
      marginToleranceMinutes,
    ) === "unreachable"
  );
}

export interface ScheduleMoviePresentation {
  isPast: boolean;
  isReachable: boolean;
  isUnreachable: boolean;
  showings: Array<{
    showing: Showing;
    isPast: boolean;
    isReachable: boolean;
    isUnreachable: boolean;
    travelMinutes: number | null;
  }>;
}

export function scheduleProgramClassName({
  isPast,
  isReachable,
  isUnreachable,
  isStarred,
  isLinked,
}: {
  isPast: boolean;
  isReachable: boolean;
  isUnreachable: boolean;
  isStarred: boolean;
  isLinked: boolean;
}): string {
  return [
    "program-block",
    isPast ? "past" : "",
    isReachable ? "reachable" : "",
    isUnreachable ? "unreachable" : "",
    isStarred ? "starred" : "",
    isLinked ? "linked" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function getScheduleMoviePresentation(
  showings: Showing[],
  now: Date,
  routeByCinema: Map<string, RouteEstimate>,
): ScheduleMoviePresentation {
  const presentationShowings = showings.map((showing) => {
    const reachability = getShowingReachability(
      showing,
      now,
      routeByCinema,
    );
    const route = routeByCinema.get(showing.cinemaId);
    return {
      showing,
      isPast: reachability === "past",
      isReachable: reachability === "reachable",
      isUnreachable: reachability === "unreachable",
      travelMinutes: route?.durationMinutes ?? null,
    };
  });

  const isPast = presentationShowings.every(({ isPast }) => isPast);
  return {
    isPast,
    isReachable: presentationShowings.some(
      ({ isReachable }) => isReachable,
    ),
    isUnreachable:
      !isPast &&
      presentationShowings.length > 0 &&
      presentationShowings.every(
        ({ isPast, isUnreachable }) => isPast || isUnreachable,
      ),
    showings: presentationShowings,
  };
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
  releaseDate: string | null;
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
      releaseDate:
        entries.find((showing) => showing.releaseDate)?.releaseDate ??
        null,
      showings: entries.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }))
    .sort((a, b) => {
      const firstA = a.showings[0]?.startsAt ?? "";
      const firstB = b.showings[0]?.startsAt ?? "";
      return firstA.localeCompare(firstB) || a.title.localeCompare(b.title, "ja");
    });
}

export function listMovieShowingDates(
  showings: Array<Pick<Showing, "startsAt">>,
): string[] {
  return [
    ...new Set(
      showings.map((showing) =>
        formatJstDate(new Date(showing.startsAt)),
      ),
    ),
  ].sort();
}

export interface ScheduleTimeGroup {
  time: string;
  label: string;
  movies: ReturnType<typeof groupByMovie>;
  showingCount: number;
}

export interface ScheduleTimeBucket {
  key: string;
  label: string;
  startMinutes: number;
  endMinutes: number;
  groups: ScheduleTimeGroup[];
  showingCount: number;
  movieCount: number;
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

function minutesFromTime(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function groupScheduleTimeBuckets(
  groups: ScheduleTimeGroup[],
  collapseMinutes: Exclude<ScheduleCollapseMinutes, 0>,
): ScheduleTimeBucket[] {
  const buckets = new Map<number, ScheduleTimeGroup[]>();
  for (const group of groups) {
    const startMinutes =
      Math.floor(minutesFromTime(group.time) / collapseMinutes) *
      collapseMinutes;
    buckets.set(startMinutes, [...(buckets.get(startMinutes) ?? []), group]);
  }

  return [...buckets.entries()]
    .sort(([startA], [startB]) => startA - startB)
    .map(([startMinutes, bucketGroups]) => {
      const endMinutes = startMinutes + collapseMinutes;
      return {
        key: timeFromMinutes(startMinutes),
        label: `${timeFromMinutes(startMinutes)}〜`,
        startMinutes,
        endMinutes,
        groups: bucketGroups,
        showingCount: bucketGroups.reduce(
          (count, group) => count + group.showingCount,
          0,
        ),
        movieCount: new Set(
          bucketGroups.flatMap((group) =>
            group.movies.map((movie) => movie.key),
          ),
        ).size,
      };
    });
}

export function shouldDefaultExpandScheduleBucket(
  bucket: Pick<ScheduleTimeBucket, "startMinutes" | "endMinutes">,
  now: Date,
  selectedDate: string,
  today: string,
): boolean {
  if (selectedDate !== today) return false;

  const bucketDuration = bucket.endMinutes - bucket.startMinutes;
  const currentMinutes = minutesFromTime(scheduleTimeSlot(now));
  const currentBucketStart =
    Math.floor(currentMinutes / bucketDuration) * bucketDuration;
  return (
    bucket.startMinutes >= currentBucketStart &&
    bucket.startMinutes <= currentBucketStart + 60
  );
}

export function shouldExpandScheduleBucket(
  searchQuery: string | null | undefined,
  defaultExpanded: boolean,
): boolean {
  return Boolean(normalizeSearchQuery(searchQuery)) || defaultExpanded;
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
