import { completeGoogleLogin } from "../../../_lib/accounts";
import {
  createUserSession,
  LEGACY_USER_ID,
  loginPage,
  resolveSession,
  sessionCookie,
  verifyLegacySession,
} from "../../../_lib/auth";
import {
  requireProfileEncryptionKey,
  type PagesEnv,
} from "../../../_lib/env";
import {
  exchangeGoogleAuthorizationCode,
  getGoogleOAuthCredentials,
} from "../../../_lib/google-calendar";
import {
  oauthCookie,
  parseCookie,
  secureStringEqual,
} from "../../../_lib/google-oauth";

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
}

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  const requestUrl = new URL(context.request.url);
  const credentials = getGoogleOAuthCredentials(context.env);
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const expectedState = parseCookie(context.request, "google_login_state");
  const verifier = parseCookie(context.request, "google_login_verifier");
  if (
    !credentials ||
    !state ||
    !code ||
    !expectedState ||
    !verifier ||
    !(await secureStringEqual(state, expectedState))
  ) {
    return loginPage(
      true,
      "",
      Boolean(credentials),
      "Googleログインを確認できませんでした。もう一度お試しください。",
    );
  }

  try {
    const redirectUri = new URL(
      "/auth/google/login/callback",
      requestUrl.origin,
    ).toString();
    const token = await exchangeGoogleAuthorizationCode(
      credentials,
      code,
      verifier,
      redirectUri,
    );
    if (!token.access_token) throw new Error("google_access_token_missing");
    const userInfoResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { authorization: `Bearer ${token.access_token}` },
      },
    );
    const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
    if (
      !userInfoResponse.ok ||
      !userInfo.sub ||
      !userInfo.email ||
      userInfo.email_verified !== true
    ) {
      throw new Error("google_identity_not_verified");
    }

    let currentSession = await resolveSession(
      context.request,
      context.env,
    );
    const legacyProof = parseCookie(
      context.request,
      "google_login_legacy_proof",
    );
    if (
      !currentSession &&
      legacyProof &&
      context.env.SESSION_SECRET &&
      (await verifyLegacySession(legacyProof, context.env.SESSION_SECRET))
    ) {
      currentSession = {
        legacy: true,
        user: {
          id: LEGACY_USER_ID,
          email: null,
          displayEmail: null,
          role: "admin",
          status: "active",
        },
      };
    }
    const user = await completeGoogleLogin(
      context.env.DB,
      {
        subject: userInfo.sub,
        email: userInfo.email,
        emailVerified: userInfo.email_verified,
      },
      currentSession,
      requireProfileEncryptionKey(context.env),
    );
    const session = await createUserSession(context.env, user.id);
    const headers = new Headers({
      location: new URL("/#schedule", requestUrl.origin).toString(),
    });
    headers.append(
      "set-cookie",
      sessionCookie(session.value, session.maxAge),
    );
    clearOauthCookies(headers, requestUrl);
    return new Response(null, { status: 303, headers });
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "google_login_failed";
    const message =
      code === "admin_bootstrap_required"
        ? "初回管理者は、先に「管理者用の閲覧パスワード」でログインしてからGoogleアカウントを連携してください。"
        : code === "invite_required"
          ? "このメールアドレスはまだ招待されていません。"
          : code === "user_disabled"
            ? "このユーザーは無効化されています。"
            : "Googleログインに失敗しました。もう一度お試しください。";
    return loginPage(true, "", true, message);
  }
};

function clearOauthCookies(headers: Headers, requestUrl: URL): void {
  const secure = requestUrl.protocol === "https:";
  headers.append(
    "set-cookie",
    oauthCookie("google_login_state", "", secure, 0),
  );
  headers.append(
    "set-cookie",
    oauthCookie("google_login_verifier", "", secure, 0),
  );
  headers.append(
    "set-cookie",
    oauthCookie("google_login_legacy_proof", "", secure, 0),
  );
}
