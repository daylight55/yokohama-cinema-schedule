import type { PagesEnv } from "../../_lib/env";
import { authenticationOptions } from "../../_lib/passkeys";

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
  try {
    return Response.json(
      await authenticationOptions(context.env.DB, context.request),
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "passkey_options_failed" },
      { status: 400 },
    );
  }
};
