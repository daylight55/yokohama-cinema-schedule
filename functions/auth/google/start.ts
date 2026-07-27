import type { PagesEnv } from "../../_lib/env";
import {
  getGoogleCalendarCredentials,
  GOOGLE_CALENDAR_SCOPES,
} from "../../_lib/google-calendar";
import {
  codeChallenge,
  oauthCookie,
  randomOauthValue,
} from "../../_lib/google-oauth";

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return new Response("Google Calendar connection is unavailable", {
      status: 403,
    });
  }
  const credentials = getGoogleCalendarCredentials(context.env);
  if (!credentials) {
    return Response.redirect(
      new URL("/#planner", context.request.url).toString(),
      302,
    );
  }

  const requestUrl = new URL(context.request.url);
  const redirectUri = new URL(
    "/auth/google/callback",
    requestUrl.origin,
  ).toString();
  const state = randomOauthValue();
  const verifier = randomOauthValue(48);
  const authorizationUrl = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth",
  );
  authorizationUrl.search = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();

  const headers = new Headers({ location: authorizationUrl.toString() });
  const secure = requestUrl.protocol === "https:";
  headers.append("set-cookie", oauthCookie("google_oauth_state", state, secure));
  headers.append(
    "set-cookie",
    oauthCookie("google_oauth_verifier", verifier, secure),
  );
  return new Response(null, { status: 302, headers });
};
