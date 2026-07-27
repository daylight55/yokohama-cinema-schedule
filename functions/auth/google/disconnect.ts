import type { AuthContextData, PagesEnv } from "../../_lib/env";
import { disconnectGoogleCalendar } from "../../_lib/google-calendar";

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE !== "true") {
    await disconnectGoogleCalendar(context.env.DB, context.data.userId);
  }
  return Response.redirect(
    new URL("/#planner", context.request.url).toString(),
    303,
  );
};
