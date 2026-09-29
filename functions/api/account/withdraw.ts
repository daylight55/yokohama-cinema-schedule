import { withdrawAccount } from "../../../shared/account-lifecycle";
import { sessionCookie } from "../../_lib/auth";
import { registeredProfileUser } from "../../_lib/member-profile";
import type { AuthContextData, PagesEnv } from "../../_lib/env";

export const onRequestPost: PagesFunction<PagesEnv, string, AuthContextData> = async ({ request, env, data, waitUntil }) => {
  const headers = new Headers({ "cache-control": "no-store" });
  if (request.headers.get("origin") !== new URL(request.url).origin || data.legacySession ||
      !(await registeredProfileUser(env, data))) {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const deleteAfter = await withdrawAccount(env.DB, data.userId);
  if (!deleteAfter) return Response.json({ error: "withdrawal_unavailable" }, { status: 409, headers });
  // The notification was queued atomically with withdrawal. Cron retries failures.
  if (env.INVITE_MAILER) {
    waitUntil(env.INVITE_MAILER.fetch("https://mailer/withdrawal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: data.userId }),
    }).then((response) => {
      if (!response.ok) console.error(JSON.stringify({ event: "withdrawal_email_retry_pending" }));
    }).catch(() => console.error(JSON.stringify({ event: "withdrawal_email_retry_pending" }))));
  }
  headers.append("set-cookie", sessionCookie("", 0));
  return Response.json({ deleteAfter }, { headers });
};
