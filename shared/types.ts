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
  imageUrl: string | null;
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
  preferences: MoviePreference[];
  preferencesEnabled: boolean;
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
  provider: "google_maps" | "custom" | "estimate";
  travelMode: "transit" | "walking";
}

export interface RoutesResponse {
  generatedAt: string;
  provider: RouteEstimate["provider"];
  routes: RouteEstimate[];
}

export interface MoviePreference {
  movieKey: string;
  title: string;
  imageUrl: string | null;
  starred: boolean;
  updatedAt: string;
}

export interface NormalizedShowing {
  sourceId: string;
  cinemaId: string;
  movieKey: string;
  title: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  screen: string | null;
  format: string | null;
  bookingUrl: string;
  purchasable: boolean | null;
}
