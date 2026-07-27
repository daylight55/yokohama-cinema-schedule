import type { AuthContextData, PagesEnv } from "../../_lib/env";

export const onRequestDelete: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id) {
    return Response.json({ error: "missing_passkey_id" }, { status: 400 });
  }
  const result = await context.env.DB.prepare(
    "DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?",
  )
    .bind(id, context.data.userId)
    .run();
  return (result.meta.changes ?? 0) > 0
    ? new Response(null, { status: 204 })
    : Response.json({ error: "passkey_not_found" }, { status: 404 });
};
