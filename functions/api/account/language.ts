import { isLanguage } from "../../../shared/language";
import type { PagesEnv, AuthContextData } from "../../_lib/env";
const headers = { "cache-control": "private, no-store" };
export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async ({ env, data }) => {
  const row = await env.DB.prepare(
    "SELECT language, role FROM users WHERE id = ?",
  )
    .bind(data.userId)
    .first<{ language: string; role: string }>();
  return Response.json(
    {
      language: isLanguage(row?.language) ? row.language : "ja",
      userRole:
        env.PUBLIC_MODE === "true"
          ? null
          : row?.role === "admin"
            ? "admin"
            : "member",
    },
    { headers },
  );
};
export const onRequestPatch: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async ({ request, env, data }) => {
  if (env.PUBLIC_MODE === "true" || !data.userId)
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("language" in body) ||
    !isLanguage(body.language)
  )
    return Response.json(
      { error: "invalid_language" },
      { status: 400, headers },
    );
  const updated = await env.DB.prepare(
    "UPDATE users SET language = ?, updated_at = ? WHERE id = ?",
  )
    .bind(body.language, new Date().toISOString(), data.userId)
    .run();
  if (updated.meta.changes !== 1)
    return Response.json({ error: "user_not_found" }, { status: 404, headers });
  return Response.json({ language: body.language }, { headers });
};
