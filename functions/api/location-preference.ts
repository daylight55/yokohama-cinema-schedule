import type { LocationPreference } from "../../shared/types";
import {
  getLocationPreference,
  setLocationPreference,
} from "../_lib/app-preferences";
import type { PagesEnv } from "../_lib/env";

interface LocationPreferenceRequest {
  autoEnabled?: boolean;
}

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return Response.json(
      { error: "location_preference_unavailable" },
      { status: 403 },
    );
  }

  const preference = await getLocationPreference(context.env.DB);
  return Response.json(preference, {
    headers: { "cache-control": "private, no-store" },
  });
};

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return Response.json(
      { error: "location_preference_unavailable" },
      { status: 403 },
    );
  }

  let body: LocationPreferenceRequest;
  try {
    body = await context.request.json<LocationPreferenceRequest>();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.autoEnabled !== "boolean") {
    return Response.json(
      { error: "invalid_location_preference" },
      { status: 400 },
    );
  }

  const preference: LocationPreference = await setLocationPreference(
    context.env.DB,
    body.autoEnabled,
  );
  return Response.json(preference, {
    headers: { "cache-control": "private, no-store" },
  });
};
