import type { PagesEnv } from "../../_lib/env";
import {
  exchangeGoogleAuthorizationCode,
  getGoogleCalendarCredentials,
  saveGoogleCalendarConnection,
} from "../../_lib/google-calendar";
import {
  oauthCookie,
  parseCookie,
  secureStringEqual,
} from "../../_lib/google-oauth";

interface GoogleUserInfo {
  email?: string;
}

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  const requestUrl = new URL(context.request.url);
  const plannerUrl = new URL("/#planner", requestUrl.origin).toString();
  const credentials = getGoogleCalendarCredentials(context.env);
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const expectedState = parseCookie(context.request, "google_oauth_state");
  const verifier = parseCookie(context.request, "google_oauth_verifier");
  if (
    !credentials ||
    !state ||
    !code ||
    !expectedState ||
    !verifier ||
    !(await secureStringEqual(state, expectedState))
  ) {
    return new Response("Google OAuth request could not be verified", {
      status: 400,
    });
  }

  const redirectUri = new URL(
    "/auth/google/callback",
    requestUrl.origin,
  ).toString();
  const token = await exchangeGoogleAuthorizationCode(
    credentials,
    code,
    verifier,
    redirectUri,
  );
  if (!token.access_token || !token.refresh_token) {
    return new Response("Google did not return an offline access token", {
      status: 400,
    });
  }

  const userInfoResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { authorization: `Bearer ${token.access_token}` },
    },
  );
  const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
  if (!userInfoResponse.ok || !userInfo.email) {
    return new Response("Google account information could not be read", {
      status: 502,
    });
  }

  await saveGoogleCalendarConnection(
    context.env,
    userInfo.email,
    token.refresh_token,
    token.scope ?? "",
  );

  const headers = new Headers({ location: plannerUrl });
  const secure = requestUrl.protocol === "https:";
  headers.append(
    "set-cookie",
    oauthCookie("google_oauth_state", "", secure, 0),
  );
  headers.append(
    "set-cookie",
    oauthCookie("google_oauth_verifier", "", secure, 0),
  );
  return new Response(null, { status: 302, headers });
};
