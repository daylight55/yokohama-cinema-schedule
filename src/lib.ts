import { addDays, todayInJst } from "../shared/date";
import { moviePreferenceKey } from "../shared/movie";
import type {
  Cinema,
  CinemaArea,
  RouteEstimate,
  ScheduleCollapseMinutes,
  Showing,
  TravelMode,
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
  { id: "kamiooka", label: "上大岡" },
];

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

export function isShowingReachable(
  showing: Pick<Showing, "startsAt" | "cinemaId">,
  now: Date,
  routeByCinema: Map<string, RouteEstimate>,
  arrivalMarginMinutes = 20,
  marginToleranceMinutes = 10,
  reachableWindowMinutes = 60,
): boolean {
  const route = routeByCinema.get(showing.cinemaId);
  if (!route) {
    return false;
  }
  const targetStartMinutes = route.durationMinutes + arrivalMarginMinutes;
  const earliestStartMinutes =
    targetStartMinutes - marginToleranceMinutes;
  const latestStartMinutes = Math.min(
    targetStartMinutes + marginToleranceMinutes,
    reachableWindowMinutes,
  );
  const startsInMinutes =
    (new Date(showing.startsAt).getTime() - now.getTime()) / 60_000;
  return (
    startsInMinutes >= earliestStartMinutes &&
    startsInMinutes <= latestStartMinutes
  );
}

export function buildGoogleMapsDirectionsUrl(
  origin: { latitude: number; longitude: number },
  destination: Pick<Cinema, "name" | "address">,
  travelMode: TravelMode,
): string {
  const googleTravelMode: Record<
    TravelMode,
    "walking" | "transit" | "bicycling"
  > = {
    walking: "walking",
    transit: "transit",
    bus: "transit",
    bicycle: "bicycling",
  };
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.name} ${destination.address}`,
    travelmode: googleTravelMode[travelMode],
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
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
