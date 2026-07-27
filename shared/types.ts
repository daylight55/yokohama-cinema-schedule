export type CinemaArea =
  | "yokohama"
  | "minatomirai"
  | "kannai"
  | "tobe"
  | "kamiooka";

export type SourceApproval = "private_only" | "approved" | "disabled";
export type TravelMode = "walking" | "transit" | "bus" | "bicycle";
export type ScheduleCollapseMinutes = 0 | 30 | 60;
export type MoviePreferenceStatus = "watched" | "not_interested";

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
  nearestStationId?: string | null;
  stationWalkMinutes?: number | null;
  stationWalkDistanceMeters?: number | null;
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
  cinemaTravelPreferences: CinemaTravelPreference[];
  cinemaTravelPreferencesEnabled: boolean;
  userProfile: UserProfile;
  userProfileEnabled: boolean;
  sourceHealth: {
    healthy: number;
    total: number;
  };
}

export interface RouteEstimate {
  cinemaId: string;
  distanceMeters: number;
  durationMinutes: number;
  calculatedDurationMinutes?: number;
  customDurationMinutes?: number;
  accessMinutes: number;
  bufferMinutes: number;
  mode: "route" | "estimate";
  provider: "google_maps" | "custom" | "estimate";
  travelMode: TravelMode;
  transitDetails?: TransitEstimateDetails;
}

export interface TransitEstimateDetails {
  originStationId: string;
  originStationName: string;
  destinationStationId: string;
  destinationStationName: string;
  originWalkMinutes: number;
  stationTravelMinutes: number;
  destinationWalkMinutes: number;
  bufferMinutes: number;
  lines: string[];
  originWalkProvider: "google_maps" | "estimate";
}

export interface Station {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface StationConnection {
  stationAId: string;
  stationBId: string;
  lineName: string;
  transportMode: "train" | "walk";
  rideMinutes: number;
  headwayMinutes: number;
  transferMinutes: number;
}

export interface RoutesResponse {
  generatedAt: string;
  provider: RouteEstimate["provider"];
  origin: RouteOrigin | null;
  routes: RouteEstimate[];
}

export interface RouteOrigin {
  latitude: number;
  longitude: number;
}

export interface MoviePreference {
  movieKey: string;
  title: string;
  imageUrl: string | null;
  starred: boolean;
  status: MoviePreferenceStatus | null;
  updatedAt: string;
}

export interface CinemaTravelPreference {
  cinemaId: string;
  travelMode: TravelMode;
  customDurationMinutes: number | null;
  updatedAt: string | null;
}

export interface UserProfile {
  homeRegistered: boolean;
  homeUpdatedAt: string | null;
  scheduleCollapseMinutes: ScheduleCollapseMinutes;
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
