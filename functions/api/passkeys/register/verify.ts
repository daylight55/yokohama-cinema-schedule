import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import type { AuthContextData, PagesEnv } from "../../../_lib/env";
import { registerPasskey } from "../../../_lib/passkeys";

interface VerifyRequest {
  challengeId?: string;
  response?: RegistrationResponseJSON;
  name?: string;
}

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  try {
    const body = await context.request.json<VerifyRequest>();
    if (!body.challengeId || !body.response) {
      throw new Error("invalid_passkey_request");
    }
    await registerPasskey(
      context.env.DB,
      context.request,
      context.data.userId,
      body.challengeId,
      body.response,
      body.name,
    );
    return Response.json(
      { ok: true },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "passkey_registration_failed" },
      { status: 400 },
    );
  }
};
