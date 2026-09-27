import {
  AVATAR_MAX_BYTES,
  PROFILE_BIO_LIMIT,
  PROFILE_NAME_LIMIT,
} from "../../../shared/member-profile";
import {
  getMemberProfile,
  registeredProfileUser,
} from "../../_lib/member-profile";
import type { AuthContextData, PagesEnv } from "../../_lib/env";
const headers = { "cache-control": "private, no-store" };
type Handler = PagesFunction<PagesEnv, string, AuthContextData>;
export const onRequestGet: Handler = async ({ env, data }) => {
  if (env.PUBLIC_MODE === "true")
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const profile = await getMemberProfile(env.DB, data.userId);
  return Response.json(profile, { status: profile ? 200 : 404, headers });
};
export const onRequestPatch: Handler = async ({ request, env, data }) => {
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    !(await registeredProfileUser(env, data))
  )
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  // Enforce the bound on streamed bytes too: Content-Length can be absent or forged.
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json(
      { error: "invalid_profile" },
      { status: 400, headers },
    );
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 192 * 1024) {
      await reader.cancel();
      return Response.json(
        { error: "profile_too_large" },
        { status: 413, headers },
      );
    }
    parts.push(value);
  }
  let body;
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return Response.json(
      { error: "invalid_profile" },
      { status: 400, headers },
    );
  }
  if (
    !body ||
    typeof body.displayName !== "string" ||
    typeof body.bio !== "string" ||
    !body.displayName.trim() ||
    [...body.displayName.trim()].length > PROFILE_NAME_LIMIT ||
    /[\u0000-\u001f\u007f]/.test(body.displayName) ||
    [...body.bio.trim()].length > PROFILE_BIO_LIMIT
  )
    return Response.json(
      { error: "invalid_profile" },
      { status: 400, headers },
    );
  let avatar: Uint8Array | null = null;
  let type: string | null = null;
  if (body.avatar !== undefined && body.avatar !== null) {
    const match =
      typeof body.avatar === "string" &&
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        body.avatar,
      );
    if (!match)
      return Response.json(
        { error: "invalid_avatar" },
        { status: 400, headers },
      );
    try {
      avatar = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    } catch {
      return Response.json(
        { error: "invalid_avatar" },
        { status: 400, headers },
      );
    }
    type = match[1];
    const sig = Array.from(avatar.slice(0, 12));
    const valid =
      type === "image/jpeg"
        ? sig[0] === 255 && sig[1] === 216 && sig[2] === 255
        : type === "image/png"
          ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => sig[i] === v)
          : new TextDecoder().decode(avatar.slice(0, 4)) === "RIFF" &&
            new TextDecoder().decode(avatar.slice(8, 12)) === "WEBP";
    if (!valid || avatar.length < 16 || avatar.length > AVATAR_MAX_BYTES)
      return Response.json(
        { error: "invalid_avatar" },
        { status: 400, headers },
      );
  }
  const changed = body.avatar !== undefined;
  await env.DB.prepare(
    `INSERT INTO member_profiles(user_id, display_name, bio, avatar, avatar_type, avatar_version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
    display_name=excluded.display_name, bio=excluded.bio, updated_at=excluded.updated_at,
    avatar=CASE WHEN ? THEN excluded.avatar ELSE member_profiles.avatar END,
    avatar_type=CASE WHEN ? THEN excluded.avatar_type ELSE member_profiles.avatar_type END,
    avatar_version=CASE WHEN ? THEN excluded.avatar_version ELSE member_profiles.avatar_version END`,
  )
    .bind(
      data.userId,
      body.displayName.trim(),
      body.bio.trim(),
      avatar ? avatar.buffer : null,
      type,
      avatar ? crypto.randomUUID() : null,
      new Date().toISOString(),
      changed ? 1 : 0,
      changed ? 1 : 0,
      changed ? 1 : 0,
    )
    .run();
  return Response.json(await getMemberProfile(env.DB, data.userId), {
    headers,
  });
};
