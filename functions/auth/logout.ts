import { clearSessionCookie, deleteSession } from "../_lib/auth";
import type { PagesEnv } from "../_lib/env";

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
  await deleteSession(context.request, context.env);
  return new Response(null, {
    status: 303,
    headers: {
      location: "/auth/login",
      "set-cookie": clearSessionCookie(),
      "cache-control": "no-store",
    },
  });
};
