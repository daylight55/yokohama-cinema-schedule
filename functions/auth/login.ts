import {
  createSession,
  hasValidSession,
  loginPage,
  passwordMatches,
  sessionCookie,
} from "../_lib/auth";
import type { PagesEnv } from "../_lib/env";

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  if (await hasValidSession(context.request, context.env)) {
    return Response.redirect(new URL("/", context.request.url), 303);
  }
  return loginPage();
};

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
  const contentType = context.request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return new Response("Unsupported media type", { status: 415 });
  }
  const data = await context.request.formData();
  const password = String(data.get("password") ?? "");
  if (!(await passwordMatches(password, context.env.APP_PASSWORD))) {
    return loginPage(true);
  }

  const session = await createSession(context.env);
  const ttlDays = Math.min(
    Math.max(Number(context.env.SESSION_TTL_DAYS ?? "30"), 1),
    90,
  );
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "set-cookie": sessionCookie(session, ttlDays * 86_400),
      "cache-control": "no-store",
    },
  });
};
