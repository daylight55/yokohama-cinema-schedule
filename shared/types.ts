export type CinemaArea =
  | "yokohama"
  | "minatomirai"
  | "kannai"
  | "tobe";

export type SourceApproval = "private_only" | "approved" | "disabled";

export interface Cinema {
  id: string;
  name: string;
  shortName: string;
  area: CinemaArea;
  areaLabel: string;
  address: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
  activeUntil: string | null;
  approval: SourceApproval;
}

export interface Showing {
  id: string;
  sourceId: string;
  cinemaId: string;
  cinemaName: string;
  cinemaShortName: string;
  area: CinemaArea;
  movieKey: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  screen: string | null;
  format: string | null;
  bookingUrl: string;
  purchasable: boolean | null;
  fetchedAt: string;
}

export interface ScheduleResponse {
  date: string;
  generatedAt: string;
  lastUpdatedAt: string | null;
  cinemas: Cinema[];
  showings: Showing[];
  sourceHealth: {
    healthy: number;
    total: number;
  };
}

export interface RouteEstimate {
  cinemaId: string;
  distanceMeters: number;
  durationMinutes: number;
  mode: "route" | "estimate";
}

export interface RoutesResponse {
  generatedAt: string;
  routes: RouteEstimate[];
}

export interface NormalizedShowing {
  sourceId: string;
  cinemaId: string;
  movieKey: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  screen: string | null;
  format: string | null;
  bookingUrl: string;
  purchasable: boolean | null;
}

