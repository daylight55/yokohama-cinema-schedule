import {
  authenticationRateKey,
  authenticationRetryAfter,
  clearAuthenticationFailures,
  createSession,
  hasValidSession,
  loginPage,
  passwordMatches,
  recordAuthenticationFailure,
  sessionCookie,
} from "../_lib/auth";
import type { PagesEnv } from "../_lib/env";

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  if (await hasValidSession(context.request, context.env)) {
    return Response.redirect(new URL("/", context.request.url), 303);
  }
  return loginPage(
    false,
    "",
    Boolean(
      context.env.GOOGLE_CLIENT_ID && context.env.GOOGLE_CLIENT_SECRET,
    ),
  );
};

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
  const contentType = context.request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return new Response("Unsupported media type", { status: 415 });
  }
  const data = await context.request.formData();
  const password = String(data.get("password") ?? "");
  const returnHash = normalizeReturnHash(data.get("returnHash"));
  const rateKey = context.env.DB
    ? await authenticationRateKey(context.request, "admin-fallback")
    : "";
  const retryAfter =
    context.env.DB && rateKey
      ? await authenticationRetryAfter(context.env.DB, rateKey)
      : 0;
  if (retryAfter > 0) {
    const response = loginPage(
      true,
      returnHash,
      Boolean(
        context.env.GOOGLE_CLIENT_ID && context.env.GOOGLE_CLIENT_SECRET,
      ),
      "ログイン試行が多すぎます。15分ほど待ってからお試しください。",
    );
    response.headers.set("retry-after", String(retryAfter));
    return response;
  }
  if (!(await passwordMatches(password, context.env.APP_PASSWORD))) {
    if (context.env.DB && rateKey) {
      await recordAuthenticationFailure(context.env.DB, rateKey);
    }
    return loginPage(
      true,
      returnHash,
      Boolean(
        context.env.GOOGLE_CLIENT_ID && context.env.GOOGLE_CLIENT_SECRET,
      ),
    );
  }

  if (context.env.DB && rateKey) {
    await clearAuthenticationFailures(context.env.DB, rateKey);
  }
  const session = await createSession(context.env);
  const ttlDays = Math.min(
    Math.max(Number(context.env.SESSION_TTL_DAYS ?? "30"), 1),
    90,
  );
  return new Response(null, {
    status: 303,
    headers: {
      location: returnHash ? `/${returnHash}` : "/",
      "set-cookie": sessionCookie(session, ttlDays * 86_400),
      "cache-control": "no-store",
    },
  });
};

export function normalizeReturnHash(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "";
  const normalized = value.toLowerCase();
  return [
    "#schedule",
    "#movies",
    "#cinemas",
    "#viewing-plans",
    "#planner",
    "#profile",
    "#account",
  ].includes(normalized)
    ? normalized
    : "";
}
