import type { AuthContextData, PagesEnv } from "../../_lib/env";
import { getGoogleCalendarStatus } from "../../_lib/google-calendar";

export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  return Response.json(
    await getGoogleCalendarStatus(context.env, context.data.userId),
    {
      headers: { "cache-control": "private, no-store" },
    },
  );
};
