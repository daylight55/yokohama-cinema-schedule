import { locationFeatureUnavailable } from "../_lib/location-feature";
import {
  requireProfileEncryptionKey,
  type AuthContextData,
  type PagesEnv,
} from "../_lib/env";
import {
  deleteDepartureLocation,
  getUserProfile,
  isScheduleCollapseMinutes,
  saveScheduleCollapseMinutes,
} from "../_lib/user-profile";

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
    await getUserProfile(
      context.env.DB,
      requireProfileEncryptionKey(context.env),
      context.data.userId,
    ),
    {
      headers: { "cache-control": "private, no-store" },
    },
  );
};

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async () => locationFeatureUnavailable();

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
    await getUserProfile(
      context.env.DB,
      requireProfileEncryptionKey(context.env),
      context.data.userId,
    ),
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

  await deleteDepartureLocation(context.env.DB, context.data.userId);
  return Response.json(
    { departureRegistered: false, departureUpdatedAt: null },
    { headers: { "cache-control": "private, no-store" } },
  );
};
