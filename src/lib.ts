import { addDays, todayInJst } from "../shared/date";
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
): boolean {
  const route = routeByCinema.get(showing.cinemaId);
  const travelMinutes = route?.durationMinutes ?? 0;
  return (
    new Date(showing.startsAt).getTime() >=
    now.getTime() + (travelMinutes + preparationMinutes) * 60_000
  );
}

export function filterShowings(
  showings: Showing[],
  options: {
    selectedArea: CinemaArea | "all";
    futureOnly: boolean;
    now: Date;
    routeByCinema: Map<string, RouteEstimate>;
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
      isShowingReachable(
        showing,
        options.now,
        options.routeByCinema,
        options.routeByCinema.size > 0 ? 10 : 0,
      )
    );
  });
}

export function groupByMovie(showings: Showing[]): Array<{
  key: string;
  title: string;
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
      title: entries[0].title,
      showings: entries.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }))
    .sort((a, b) => {
      const firstA = a.showings[0]?.startsAt ?? "";
      const firstB = b.showings[0]?.startsAt ?? "";
      return firstA.localeCompare(firstB) || a.title.localeCompare(b.title, "ja");
    });
}

export function normalizeMovieTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[【（(].*?(?:】|）|\))/g, "")
    .replace(/(?:字幕|吹替|日本語版|2D|3D|IMAX|4DX|DolbyCinema)/gi, "")
    .toLowerCase();
}
