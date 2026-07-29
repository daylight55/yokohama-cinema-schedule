import { todayInJst } from "../../../shared/date";
import { buildGoogleMapsDirectionsUrl } from "../../../shared/maps";
import {
  DEFAULT_TRAVEL_MODE,
  listCinemaTravelPreferences,
} from "../../_lib/cinema-travel-preferences";
import { listActiveCinemas } from "../../_lib/cinemas";
import {
  requireProfileEncryptionKey,
  type AuthContextData,
  type PagesEnv,
} from "../../_lib/env";
import { getDepartureLocation } from "../../_lib/user-profile";

export const onRequestGet: PagesFunction<
  PagesEnv,
  "cinemaId",
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return Response.json(
      { error: "route_guidance_unavailable" },
      { status: 403 },
    );
  }

  const departure = await getDepartureLocation(
    context.env.DB,
    requireProfileEncryptionKey(context.env),
    context.data.userId,
  );
  if (!departure) {
    return Response.json(
      { error: "departure_location_required" },
      { status: 409 },
    );
  }

  const cinemas = await listActiveCinemas(
    context.env.DB,
    todayInJst(),
    false,
  );
  const cinema = cinemas.find(
    (candidate) => candidate.id === context.params.cinemaId,
  );
  if (!cinema) {
    return Response.json({ error: "cinema_not_found" }, { status: 404 });
  }

  const [preference] = await listCinemaTravelPreferences(
    context.env.DB,
    [cinema],
    context.data.userId,
  );
  const location = buildGoogleMapsDirectionsUrl(
    departure,
    cinema,
    preference?.travelMode ?? DEFAULT_TRAVEL_MODE,
  );
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
};
