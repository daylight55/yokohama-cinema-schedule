import { todayInJst } from "../../shared/date";
import type {
  MovieMarathonPlannerResponse,
  MovieMarathonProposal,
} from "../../shared/types";
import type { AuthContextData, PagesEnv } from "../_lib/env";
import {
  getGoogleCalendarStatus,
  refreshGoogleAccessToken,
} from "../_lib/google-calendar";
import {
  deleteMovieMarathonPlan,
  generateMovieMarathonProposal,
  getMovieMarathonPlan,
  isPlannerDateAllowed,
  listMovieMarathonPlans,
  listPlannerShowings,
  saveMovieMarathonPlan,
} from "../_lib/movie-marathon";

interface PlannerRequest {
  action?: "generate" | "save";
  date?: string;
  startTime?: string;
  endTime?: string;
}

function unavailable(): Response {
  return Response.json({ error: "planner_unavailable" }, { status: 403 });
}

export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();
  const url = new URL(context.request.url);
  const date = url.searchParams.get("date") ?? todayInJst();
  if (!isPlannerDateAllowed(date)) {
    return Response.json({ error: "invalid_date" }, { status: 400 });
  }
  const [showings, savedPlans, calendar] = await Promise.all([
    listPlannerShowings(context.env, date),
    listMovieMarathonPlans(context.env.DB, context.data.userId),
    getGoogleCalendarStatus(context.env, context.data.userId),
  ]);
  const response: MovieMarathonPlannerResponse = {
    date,
    schedulePublished: showings.length > 0,
    showingCount: showings.length,
    savedPlans,
    calendar,
  };
  return Response.json(response, {
    headers: { "cache-control": "private, no-store" },
  });
};

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();
  const body = (await context.request.json()) as PlannerRequest;
  const date = body.date ?? "";
  const startTime = body.startTime ?? "";
  const endTime = body.endTime ?? "";
  if (
    !isPlannerDateAllowed(date) ||
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !/^\d{2}:\d{2}$/.test(endTime)
  ) {
    return Response.json({ error: "invalid_planner_request" }, { status: 400 });
  }
  let proposal: MovieMarathonProposal;
  try {
    proposal = await generateMovieMarathonProposal(
      context.env,
      date,
      startTime,
      endTime,
      context.data.userId,
    );
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json(
        { error: "invalid_planner_window" },
        { status: 400 },
      );
    }
    throw error;
  }
  if (body.action === "generate") {
    return Response.json(proposal, {
      headers: { "cache-control": "private, no-store" },
    });
  }
  if (body.action === "save") {
    return Response.json(
      await saveMovieMarathonPlan(
        context.env.DB,
        proposal,
        context.data.userId,
      ),
      { status: 201 },
    );
  }
  return Response.json({ error: "invalid_action" }, { status: 400 });
};

export const onRequestDelete: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();
  const planId = new URL(context.request.url).searchParams.get("id");
  if (!planId) {
    return Response.json({ error: "missing_plan_id" }, { status: 400 });
  }
  const plan = await getMovieMarathonPlan(
    context.env.DB,
    planId,
    context.data.userId,
  );
  if (!plan) {
    return Response.json({ error: "plan_not_found" }, { status: 404 });
  }
  if (plan.googleCalendarEventId) {
    const accessToken = await refreshGoogleAccessToken(
      context.env,
      context.data.userId,
    );
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(plan.googleCalendarEventId)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      return Response.json(
        { error: "google_calendar_delete_failed" },
        { status: 502 },
      );
    }
  }
  const deleted = await deleteMovieMarathonPlan(
    context.env.DB,
    planId,
    context.data.userId,
  );
  return deleted
    ? new Response(null, { status: 204 })
    : Response.json({ error: "plan_not_found" }, { status: 404 });
};
