import { withdrawAccount } from "../../../shared/account-lifecycle";
import { sessionCookie } from "../../_lib/auth";
import { registeredProfileUser } from "../../_lib/member-profile";
import type { AuthContextData, PagesEnv } from "../../_lib/env";

export const onRequestPost: PagesFunction<PagesEnv, string, AuthContextData> = async ({ request, env, data }) => {
  const headers = new Headers({ "cache-control": "no-store" });
  if (request.headers.get("origin") !== new URL(request.url).origin || data.legacySession ||
      !(await registeredProfileUser(env, data))) {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const deleteAfter = await withdrawAccount(env.DB, data.userId);
  if (!deleteAfter) return Response.json({ error: "withdrawal_unavailable" }, { status: 409, headers });
  headers.append("set-cookie", sessionCookie("", 0));
  return Response.json({ deleteAfter }, { headers });
};
