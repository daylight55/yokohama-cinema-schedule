import { SESSION_COOKIE } from "../_lib/auth";
import type { PagesEnv } from "../_lib/env";

export const onRequestPost: PagesFunction<PagesEnv> = async () =>
  new Response(null, {
    status: 303,
    headers: {
      location: "/auth/login",
      "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      "cache-control": "no-store",
    },
  });
