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
  streetViewLatitude?: number;
  streetViewLongitude?: number;
  streetViewHeading?: number | null;
  streetViewPitch?: number;
  streetViewFov?: number;
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
  releaseDate?: string | null;
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
  originRegistered: boolean;
  origin: "saved" | "current" | null;
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
  showInSchedule: boolean;
  note: string;
  updatedAt: string | null;
}

export interface UserProfile {
  departureRegistered: boolean;
  departureUpdatedAt: string | null;
  scheduleCollapseMinutes: ScheduleCollapseMinutes;
}

export interface AccountPasskey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ManagedUser {
  id: string;
  email: string | null;
  role: "admin" | "member";
  status: "active" | "disabled";
  lastLoginAt: string | null;
}

export interface AccountResponse {
  user: {
    id: string;
    email: string | null;
    displayEmail: string | null;
    role: "admin" | "member";
    legacy: boolean;
  };
  methods: {
    google: boolean;
    password: boolean;
    passkeySupported: boolean;
  };
  passkeys: AccountPasskey[];
  users: ManagedUser[];
  pendingInvites: Array<{ email: string; createdAt: string }>;
  googleConfigured: boolean;
}

export interface MovieMarathonPlanItem {
  showingId: string;
  sequence: number;
  movieKey: string;
  title: string;
  cinemaId: string;
  cinemaName: string;
  startsAt: string;
  endsAt: string;
  bookingUrl: string;
  starred: boolean;
  transferMinutes: number;
}

export interface ViewingPlan {
  showingId: string;
  movieKey: string;
  title: string;
  cinemaId: string;
  cinemaName: string;
  cinemaShortName: string;
  startsAt: string;
  endsAt: string | null;
  screen: string | null;
  format: string | null;
  bookingUrl: string;
  reservedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ViewingPlansResponse {
  plans: ViewingPlan[];
}

export interface MovieMarathonPlan {
  id: string;
  planDate: string;
  availableStart: string;
  availableEnd: string;
  status: "draft" | "planned";
  googleCalendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
  items: MovieMarathonPlanItem[];
}

export interface MovieMarathonProposal {
  planDate: string;
  availableStart: string;
  availableEnd: string;
  starredCount: number;
  movieCount: number;
  totalTransferMinutes: number;
  items: MovieMarathonPlanItem[];
}

export interface GoogleCalendarConnectionStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  updatedAt: string | null;
}

export interface CalendarBusyPeriod {
  start: string;
  end: string;
}

export interface CalendarAvailabilityResponse {
  date: string;
  busy: CalendarBusyPeriod[];
  free: CalendarBusyPeriod[];
  suggestedStart: string | null;
  suggestedEnd: string | null;
}

export interface MovieMarathonPlannerResponse {
  date: string;
  schedulePublished: boolean;
  showingCount: number;
  savedPlans: MovieMarathonPlan[];
  calendar: GoogleCalendarConnectionStatus;
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
