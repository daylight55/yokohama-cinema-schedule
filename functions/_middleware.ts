import { hasValidSession, loginPage } from "./_lib/auth";
import type { PagesEnv } from "./_lib/env";

export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  const url = new URL(context.request.url);
  if (url.pathname.startsWith("/auth/")) {
    return context.next();
  }

  if (!(await hasValidSession(context.request, context.env))) {
    const acceptsHtml =
      context.request.headers.get("accept")?.includes("text/html") ?? false;
    if (url.pathname.startsWith("/api/") || !acceptsHtml) {
      return Response.json(
        { error: "authentication_required" },
        {
          status: 401,
          headers: {
            "cache-control": "no-store",
            "x-robots-tag": "noindex, nofollow, noarchive",
          },
        },
      );
    }
    return loginPage();
  }

  const response = await context.next();
  const secured = new Response(response.body, response);
  secured.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  secured.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("x-frame-options", "DENY");
  if (!url.pathname.startsWith("/assets/")) {
    secured.headers.set("cache-control", "private, no-store");
  }
  return secured;
};
