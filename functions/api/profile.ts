import type { RouteOrigin } from "../../shared/types";
import type { PagesEnv } from "../_lib/env";
import {
  estimateWalksToStations,
  listPreferredOriginStationIds,
  listStations,
} from "../_lib/stations";
import {
  deleteHomeLocation,
  getUserProfile,
  normalizeHomeCoordinates,
  saveHomeLocation,
} from "../_lib/user-profile";

interface ProfileRequest {
  latitude?: number;
  longitude?: number;
}

function unavailable() {
  return Response.json({ error: "profile_unavailable" }, { status: 403 });
}

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();

  return Response.json(await getUserProfile(context.env.DB), {
    headers: { "cache-control": "private, no-store" },
  });
};

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
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
  );

  return Response.json(profile, {
    headers: { "cache-control": "private, no-store" },
  });
};

export const onRequestDelete: PagesFunction<PagesEnv> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();

  await deleteHomeLocation(context.env.DB);
  return Response.json(
    { homeRegistered: false, homeUpdatedAt: null },
    { headers: { "cache-control": "private, no-store" } },
  );
};
