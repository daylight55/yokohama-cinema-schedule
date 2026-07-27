import { jstLocalToIso } from "../../../shared/date";
import { findFreeCalendarPeriods } from "../../../shared/planner";
import type {
  CalendarAvailabilityResponse,
  CalendarBusyPeriod,
} from "../../../shared/types";
import type { PagesEnv } from "../../_lib/env";
import { refreshGoogleAccessToken } from "../../_lib/google-calendar";
import { isPlannerDateAllowed } from "../../_lib/movie-marathon";

interface FreeBusyPayload {
  calendars?: {
    primary?: {
      busy?: CalendarBusyPeriod[];
      errors?: Array<{ reason?: string }>;
    };
  };
}

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return Response.json({ error: "calendar_unavailable" }, { status: 403 });
  }
  const date = new URL(context.request.url).searchParams.get("date") ?? "";
  if (!isPlannerDateAllowed(date)) {
    return Response.json({ error: "invalid_date" }, { status: 400 });
  }
  const windowStart = jstLocalToIso(date, "08:00");
  const windowEnd = jstLocalToIso(date, "23:59");
  const accessToken = await refreshGoogleAccessToken(context.env);
  const googleResponse = await fetch(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        timeMin: windowStart,
        timeMax: windowEnd,
        timeZone: "Asia/Tokyo",
        items: [{ id: "primary" }],
      }),
    },
  );
  const payload = (await googleResponse.json()) as FreeBusyPayload;
  if (!googleResponse.ok || payload.calendars?.primary?.errors?.length) {
    return Response.json(
      { error: "google_calendar_availability_failed" },
      { status: 502 },
    );
  }
  const busy = payload.calendars?.primary?.busy ?? [];
  const free = findFreeCalendarPeriods(
    windowStart,
    windowEnd,
    busy,
    90,
  ).sort(
    (left, right) =>
      new Date(right.end).getTime() -
      new Date(right.start).getTime() -
      (new Date(left.end).getTime() - new Date(left.start).getTime()),
  );
  const suggested = free[0] ?? null;
  const response: CalendarAvailabilityResponse = {
    date,
    busy,
    free,
    suggestedStart: suggested?.start ?? null,
    suggestedEnd: suggested?.end ?? null,
  };
  return Response.json(response, {
    headers: { "cache-control": "private, no-store" },
  });
};
