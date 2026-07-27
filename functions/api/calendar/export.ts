import type { AuthContextData, PagesEnv } from "../../_lib/env";
import {
  buildGoogleCalendarEvent,
  refreshGoogleAccessToken,
} from "../../_lib/google-calendar";
import {
  getMovieMarathonPlan,
  markPlanCalendarEvent,
} from "../../_lib/movie-marathon";

interface ExportRequest {
  planId?: string;
}

interface GoogleEventResponse {
  id?: string;
  htmlLink?: string;
}

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return Response.json({ error: "calendar_unavailable" }, { status: 403 });
  }
  const body = (await context.request.json()) as ExportRequest;
  if (!body.planId) {
    return Response.json({ error: "missing_plan_id" }, { status: 400 });
  }
  const plan = await getMovieMarathonPlan(
    context.env.DB,
    body.planId,
    context.data.userId,
  );
  if (!plan) {
    return Response.json({ error: "plan_not_found" }, { status: 404 });
  }
  if (plan.items.length === 0) {
    return Response.json({ error: "empty_plan" }, { status: 400 });
  }
  if (plan.googleCalendarEventId) {
    return Response.json({
      eventId: plan.googleCalendarEventId,
      alreadySynced: true,
    });
  }

  const accessToken = await refreshGoogleAccessToken(
    context.env,
    context.data.userId,
  );
  const googleResponse = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildGoogleCalendarEvent(plan)),
    },
  );
  const payload = (await googleResponse.json()) as GoogleEventResponse;
  if (!googleResponse.ok || !payload.id) {
    return Response.json(
      { error: "google_calendar_export_failed" },
      { status: 502 },
    );
  }
  await markPlanCalendarEvent(
    context.env.DB,
    plan.id,
    payload.id,
    context.data.userId,
  );
  return Response.json({
    eventId: payload.id,
    htmlLink: payload.htmlLink ?? null,
    alreadySynced: false,
  });
};
