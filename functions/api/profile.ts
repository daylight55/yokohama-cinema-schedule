import type { RouteOrigin } from "../../shared/types";
import type { AuthContextData, PagesEnv } from "../_lib/env";
import {
  estimateWalksToStations,
  listPreferredOriginStationIds,
  listStations,
} from "../_lib/stations";
import {
  deleteHomeLocation,
  getUserProfile,
  isScheduleCollapseMinutes,
  normalizeHomeCoordinates,
  saveScheduleCollapseMinutes,
  saveHomeLocation,
} from "../_lib/user-profile";

interface ProfileRequest {
  latitude?: number;
  longitude?: number;
}

interface DisplayPreferenceRequest {
  scheduleCollapseMinutes?: unknown;
}

function unavailable() {
  return Response.json({ error: "profile_unavailable" }, { status: 403 });
}

export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();

  return Response.json(
    await getUserProfile(context.env.DB, context.data.userId),
    {
    headers: { "cache-control": "private, no-store" },
    },
  );
};

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();

  let body: ProfileRequest;
  try {
    body = await context.request.json<ProfileRequest>();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const home: RouteOrigin | null = normalizeHomeCoordinates(
    body.latitude,
    body.longitude,
  );
  if (!home) {
    return Response.json({ error: "invalid_location" }, { status: 400 });
  }

  const [stations, preferredOriginStationIds] = await Promise.all([
    listStations(context.env.DB),
    listPreferredOriginStationIds(context.env.DB),
  ]);
  const originStations =
    preferredOriginStationIds.size > 0
      ? stations.filter((station) =>
          preferredOriginStationIds.has(station.id),
        )
      : stations;
  const stationWalks = await estimateWalksToStations(
    home.latitude,
    home.longitude,
    originStations,
    context.env.GOOGLE_MAPS_API_KEY,
  );
  const profile = await saveHomeLocation(
    context.env.DB,
    home,
    stationWalks,
    context.data.userId,
  );

  return Response.json(profile, {
    headers: { "cache-control": "private, no-store" },
  });
};

export const onRequestPatch: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();

  let body: DisplayPreferenceRequest;
  try {
    body = await context.request.json<DisplayPreferenceRequest>();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isScheduleCollapseMinutes(body.scheduleCollapseMinutes)) {
    return Response.json(
      { error: "invalid_schedule_collapse_minutes" },
      { status: 400 },
    );
  }

  await saveScheduleCollapseMinutes(
    context.env.DB,
    body.scheduleCollapseMinutes,
    context.data.userId,
  );
  return Response.json(
    await getUserProfile(context.env.DB, context.data.userId),
    {
      headers: { "cache-control": "private, no-store" },
    },
  );
};

export const onRequestDelete: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();

  await deleteHomeLocation(context.env.DB, context.data.userId);
  return Response.json(
    { homeRegistered: false, homeUpdatedAt: null },
    { headers: { "cache-control": "private, no-store" } },
  );
};
