import { loginPage, resolveSession } from "./_lib/auth";
import type { AuthContextData, PagesEnv } from "./_lib/env";

export const onRequest: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  const url = new URL(context.request.url);
  if (
    isPublicAuthPath(url.pathname) ||
    isPublicShellAssetPath(url.pathname)
  ) {
    return context.next();
  }

  const session = await resolveSession(context.request, context.env);
  if (!session) {
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
    return loginPage(
      false,
      "",
      Boolean(
        context.env.GOOGLE_CLIENT_ID && context.env.GOOGLE_CLIENT_SECRET,
      ),
    );
  }

  context.data.userId = session.user.id;
  context.data.authUser = session.user;
  context.data.legacySession = session.legacy;

  const response = await context.next();
  const secured = new Response(response.body, response);
  secured.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  secured.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  secured.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(self)",
  );
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("x-frame-options", "DENY");
  if (!url.pathname.startsWith("/assets/")) {
    secured.headers.set("cache-control", "private, no-store");
  }
  return secured;
};

export function isPublicAuthPath(pathname: string): boolean {
  return (
    pathname === "/auth/login" ||
    pathname === "/auth/logout" ||
    pathname === "/auth/password/login" ||
    pathname === "/auth/passkeys/options" ||
    pathname === "/auth/passkeys/verify" ||
    pathname === "/auth/google/login/start" ||
    pathname === "/auth/google/login/callback" ||
    pathname === "/auth/google/callback"
  );
}

export function isPublicShellAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/brand/") ||
    pathname === "/site.webmanifest" ||
    pathname === "/login-route.js" ||
    pathname === "/passkey-login.js"
  );
}
