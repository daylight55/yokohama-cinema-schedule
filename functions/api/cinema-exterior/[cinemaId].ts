import { todayInJst } from "../../../shared/date";
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

  const streetViewUrl = new URL(
    "https://www.google.com/maps/embed/v1/streetview",
  );
  streetViewUrl.searchParams.set("key", context.env.GOOGLE_MAPS_API_KEY);
  streetViewUrl.searchParams.set(
    "location",
    `${cinema.streetViewLatitude ?? cinema.latitude},${cinema.streetViewLongitude ?? cinema.longitude}`,
  );
  streetViewUrl.searchParams.set("fov", String(cinema.streetViewFov ?? 95));
  streetViewUrl.searchParams.set("pitch", String(cinema.streetViewPitch ?? 0));
  if (cinema.streetViewHeading != null) {
    streetViewUrl.searchParams.set(
      "heading",
      String(cinema.streetViewHeading),
    );
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: streetViewUrl.toString(),
      "cache-control": "private, max-age=3600",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
};
