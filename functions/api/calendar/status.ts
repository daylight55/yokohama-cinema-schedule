import type { PagesEnv } from "../../_lib/env";
import { getGoogleCalendarStatus } from "../../_lib/google-calendar";

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  return Response.json(await getGoogleCalendarStatus(context.env), {
    headers: { "cache-control": "private, no-store" },
  });
};
