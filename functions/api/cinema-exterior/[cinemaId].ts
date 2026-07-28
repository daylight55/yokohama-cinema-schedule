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
    "https://maps.googleapis.com/maps/api/streetview",
  );
  streetViewUrl.searchParams.set(
    "location",
    `${cinema.latitude},${cinema.longitude}`,
  );
  streetViewUrl.searchParams.set("size", "480x270");
  streetViewUrl.searchParams.set("source", "outdoor");
  streetViewUrl.searchParams.set("fov", "95");
  streetViewUrl.searchParams.set("pitch", "0");
  streetViewUrl.searchParams.set("return_error_code", "true");
  streetViewUrl.searchParams.set("key", context.env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(streetViewUrl, {
    headers: { accept: "image/jpeg" },
  });
  if (!response.ok || !response.body) {
    return new Response(null, { status: response.status === 404 ? 404 : 502 });
  }

  return new Response(response.body, {
    headers: {
      "cache-control": "private, max-age=86400",
      "content-type": response.headers.get("content-type") ?? "image/jpeg",
      "x-content-type-options": "nosniff",
    },
  });
};
