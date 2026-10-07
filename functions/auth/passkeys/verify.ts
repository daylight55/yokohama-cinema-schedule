import { sessionCookie } from "../../_lib/auth";
import type { PagesEnv } from "../../_lib/env";
import { authenticatePasskey } from "../../_lib/passkeys";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { authenticatedLogin } from "../../_lib/account-restoration";

interface VerifyRequest {
  challengeId?: string;
  response?: AuthenticationResponseJSON;
  returnHash?: string;
}

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
  try {
    const body = await context.request.json<VerifyRequest>();
    if (!body.challengeId || !body.response) {
      throw new Error("invalid_passkey_request");
    }
    const userId = await authenticatePasskey(
      context.env.DB,
      context.request,
      body.challengeId,
      body.response,
    );
    const result = await authenticatedLogin(context.env, userId, body.returnHash);
    return Response.json(
      { ok: true, ...(result.restoreCookie ? { redirect: "/auth/restore" } : {}) },
      {
        headers: {
          "set-cookie": result.restoreCookie ?? sessionCookie(result.session!.value, result.session!.maxAge),
          "cache-control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "passkey_authentication_failed" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
};
