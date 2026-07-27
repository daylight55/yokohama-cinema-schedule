import type { PagesEnv } from "../../../_lib/env";
import {
  createSession,
  LEGACY_USER_ID,
  resolveSession,
} from "../../../_lib/auth";
import { getGoogleOAuthCredentials } from "../../../_lib/google-calendar";
import {
  codeChallenge,
  oauthCookie,
  randomOauthValue,
} from "../../../_lib/google-oauth";

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  const credentials = getGoogleOAuthCredentials(context.env);
  if (!credentials) {
    return new Response("Google OAuth is not configured", { status: 503 });
  }

  const requestUrl = new URL(context.request.url);
  const redirectUri = new URL(
    "/auth/google/login/callback",
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
    scope: "openid email",
    state,
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const headers = new Headers({ location: authorizationUrl.toString() });
  const secure = requestUrl.protocol === "https:";
  headers.append(
    "set-cookie",
    oauthCookie("google_login_state", state, secure),
  );
  headers.append(
    "set-cookie",
    oauthCookie("google_login_verifier", verifier, secure),
  );
  const currentSession = await resolveSession(
    context.request,
    context.env,
  );
  if (
    currentSession?.legacy &&
    currentSession.user.id === LEGACY_USER_ID
  ) {
    headers.append(
      "set-cookie",
      oauthCookie(
        "google_login_legacy_proof",
        await createSession(context.env),
        secure,
      ),
    );
  }
  return new Response(null, { status: 302, headers });
};
