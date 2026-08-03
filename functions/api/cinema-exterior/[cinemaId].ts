import { todayInJst } from "../../../shared/date";
import { buildGoogleMapsPlaceEmbedUrl } from "../../../shared/maps";
import { listActiveCinemas } from "../../_lib/cinemas";
import type { AuthContextData, PagesEnv } from "../../_lib/env";

export const onRequestGet: PagesFunction<
  PagesEnv,
  "cinemaId",
  AuthContextData
> = async (context) => {
  if (!context.env.GOOGLE_MAPS_API_KEY) {
    return new Response(null, { status: 503 });
  }

  const cinemas = await listActiveCinemas(
    context.env.DB,
    todayInJst(),
    context.env.PUBLIC_MODE === "true",
  );
  const cinema = cinemas.find(
    (candidate) => candidate.id === context.params.cinemaId,
  );
  if (!cinema) return new Response(null, { status: 404 });

  const placeUrl = buildGoogleMapsPlaceEmbedUrl(
    context.env.GOOGLE_MAPS_API_KEY,
    cinema,
  );

  return new Response(null, {
    status: 302,
    headers: {
      location: placeUrl,
      "cache-control": "private, max-age=3600",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
};
