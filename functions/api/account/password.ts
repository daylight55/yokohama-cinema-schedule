import {
  saveUserPassword,
  validateNewPassword,
} from "../../_lib/auth";
import type { AuthContextData, PagesEnv } from "../../_lib/env";

interface PasswordRequest {
  password?: string;
}

export const onRequestPut: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (!context.data.authUser.email) {
    return Response.json(
      { error: "account_email_required" },
      { status: 409 },
    );
  }
  let body: PasswordRequest;
  try {
    body = await context.request.json<PasswordRequest>();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const password = body.password ?? "";
  const error = validateNewPassword(password);
  if (error) {
    return Response.json(
      { error: "invalid_password", message: error },
      { status: 400 },
    );
  }
  await saveUserPassword(context.env.DB, context.data.userId, password);
  return Response.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
};
