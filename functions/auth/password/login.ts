import { requestLanguage } from "../../../shared/language";
import { accountCanLogin } from "../../../shared/account-lifecycle";
import {
  authenticationRateKey,
  authenticationRetryAfter,
  burnPasswordVerification,
  clearAuthenticationFailures,
  findUserByEmail,
  loginPage,
  normalizeEmail,
  recordAuthenticationFailure,
  sessionCookie,
  verifyUserPassword,
} from "../../_lib/auth";
import type { PagesEnv } from "../../_lib/env";
import { normalizeReturnHash } from "../login";
import { authenticatedLogin } from "../../_lib/account-restoration";

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
  const contentType = context.request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return new Response("Unsupported media type", { status: 415 });
  }

  const data = await context.request.formData();
  const emailValue = String(data.get("email") ?? "");
  const password = String(data.get("password") ?? "");
  const returnHash = normalizeReturnHash(data.get("returnHash"));
  const email = normalizeEmail(emailValue);
  const rateKey = await authenticationRateKey(
    context.request,
    email ?? emailValue.trim().toLowerCase(),
  );
  const retryAfter = await authenticationRetryAfter(context.env.DB, rateKey);
  if (retryAfter > 0) {
    const response = loginPage(
      true,
      returnHash,
      Boolean(context.env.GOOGLE_CLIENT_ID && context.env.GOOGLE_CLIENT_SECRET),
      "ログイン試行が多すぎます。15分ほど待ってからお試しください。",
      "",
      requestLanguage(context.request),
    );
    response.headers.set("retry-after", String(retryAfter));
    return response;
  }

  const user = email ? await findUserByEmail(context.env.DB, email) : null;
  const verified =
    user && await accountCanLogin(context.env.DB, user.id)
      ? await verifyUserPassword(context.env.DB, user.id, password)
      : false;
  if (!user || !verified) {
    if (!user) await burnPasswordVerification(password);
    await recordAuthenticationFailure(context.env.DB, rateKey);
    return loginPage(
      true,
      returnHash,
      Boolean(context.env.GOOGLE_CLIENT_ID && context.env.GOOGLE_CLIENT_SECRET),
      "メールアドレスまたはパスワードを確認してください。",
      "",
      requestLanguage(context.request),
    );
  }

  await clearAuthenticationFailures(context.env.DB, rateKey);
  let result;
  try { result = await authenticatedLogin(context.env, user.id, returnHash); }
  catch { return loginPage(true, returnHash, false, "メールアドレスまたはパスワードを確認してください。", "", requestLanguage(context.request)); }
  return new Response(null, {
    status: 303,
    headers: {
      location: result.restoreCookie ? "/auth/restore" : returnHash ? `/${returnHash}` : "/",
      "set-cookie": result.restoreCookie ?? sessionCookie(result.session!.value, result.session!.maxAge),
      "cache-control": "no-store",
    },
  });
};
