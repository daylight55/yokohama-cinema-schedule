import type { AuthContextData, PagesEnv } from "../../../_lib/env";
import { registrationOptions } from "../../../_lib/passkeys";

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  try {
    return Response.json(
      await registrationOptions(
        context.env.DB,
        context.request,
        context.data.authUser,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "passkey_registration_unavailable" },
      { status: 400 },
    );
  }
};
