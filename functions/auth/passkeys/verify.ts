import {
  createUserSession,
  sessionCookie,
} from "../../_lib/auth";
import type { PagesEnv } from "../../_lib/env";
import { authenticatePasskey } from "../../_lib/passkeys";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

interface VerifyRequest {
  challengeId?: string;
  response?: AuthenticationResponseJSON;
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
    const session = await createUserSession(context.env, userId);
    return Response.json(
      { ok: true },
      {
        headers: {
          "set-cookie": sessionCookie(session.value, session.maxAge),
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
