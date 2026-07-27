import type { PagesEnv } from "../../_lib/env";
import { disconnectGoogleCalendar } from "../../_lib/google-calendar";

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
  if (context.env.PUBLIC_MODE !== "true") {
    await disconnectGoogleCalendar(context.env.DB);
  }
  return Response.redirect(
    new URL("/#planner", context.request.url).toString(),
    303,
  );
};
