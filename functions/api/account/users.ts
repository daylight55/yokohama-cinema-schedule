import type { AuthContextData, PagesEnv } from "../../_lib/env";

interface UserRequest {
  userId?: string;
  status?: "active" | "disabled";
}

export const onRequestPatch: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (
    context.data.authUser.role !== "admin" ||
    context.request.headers.get("origin") !==
      new URL(context.request.url).origin
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: UserRequest;
  try {
    body = await context.request.json<UserRequest>();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (
    !body ||
    typeof body.userId !== "string" ||
    !body.userId ||
    body.userId === context.data.userId ||
    !["active", "disabled"].includes(body.status ?? "")
  ) {
    return Response.json({ error: "invalid_user_update" }, { status: 400 });
  }
  const result = await context.env.DB.prepare(
    `UPDATE users SET status = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(body.status, new Date().toISOString(), body.userId)
    .run();
  return (result.meta.changes ?? 0) > 0
    ? Response.json({ ok: true }, { headers: { "cache-control": "no-store" } })
    : Response.json({ error: "user_not_found" }, { status: 404 });
};
