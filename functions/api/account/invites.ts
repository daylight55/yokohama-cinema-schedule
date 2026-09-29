import { registeredProfileUser } from "../../_lib/member-profile";
import { isLanguage } from "../../../shared/language";
import { createInvite, type SignupInvite } from "../../_lib/invitations";
import type { AuthContextData, PagesEnv } from "../../_lib/env";

const headers = { "cache-control": "private, no-store" };
function authorized(context: {
  data: AuthContextData;
  request: Request;
}): boolean {
  return (
    context.request.headers.get("origin") ===
    new URL(context.request.url).origin
  );
}
export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (!(await registeredProfileUser(context.env, context.data)))
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const result = await context.env.DB.prepare(
    `SELECT id, email, created_at, expires_at, accepted_at, revoked_at FROM signup_invites WHERE (? = 'admin' OR invited_by = ?) ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(context.data.authUser.role, context.data.userId)
    .all<SignupInvite>();
  return Response.json(
    {
      invites: result.results,
      emailConfigured: Boolean(
        context.env.INVITE_MAILER && context.env.INVITE_FROM_EMAIL,
      ),
    },
    { headers },
  );
};
export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (
    !authorized(context) ||
    !(await registeredProfileUser(context.env, context.data))
  )
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  if (context.data.legacySession && context.data.userId === "legacy-local") {
    return Response.json(
      {
        error: "admin_bootstrap_required",
        message: "先にマイページで管理者のGoogleアカウントを連携してください。",
      },
      { status: 409, headers },
    );
  }
  let body: {
    email?: unknown;
    sendEmail?: unknown;
    language?: unknown;
    groupId?: unknown;
  };
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers });
  }
  if (
    !body ||
    typeof body !== "object" ||
    (body.email !== undefined && typeof body.email !== "string") ||
    (body.sendEmail !== undefined && typeof body.sendEmail !== "boolean") ||
    (body.language !== undefined && !isLanguage(body.language)) ||
    (body.groupId !== undefined &&
      body.groupId !== null &&
      typeof body.groupId !== "string")
  ) {
    return Response.json(
      { error: "invalid_request" },
      { status: 400, headers },
    );
  }
  const email = typeof body.email === "string" ? body.email : "";
  if (
    body.sendEmail &&
    (!email.trim() ||
      !context.env.INVITE_MAILER ||
      !context.env.INVITE_FROM_EMAIL)
  ) {
    return Response.json(
      {
        error: "email_unavailable",
        message:
          "メール送信を利用できません。招待リンクを発行して共有してください。",
      },
      { status: 400, headers },
    );
  }
  const groupId =
    typeof body.groupId === "string" && body.groupId ? body.groupId : null;
  if (
    groupId &&
    !(await context.env.DB.prepare(
      "SELECT 1 FROM sharing_group_members WHERE group_id=? AND user_id=?",
    )
      .bind(groupId, context.data.userId)
      .first())
  )
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const pending = await context.env.DB.prepare(
    "SELECT count(*) n FROM signup_invites WHERE invited_by=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?",
  )
    .bind(context.data.userId, new Date().toISOString())
    .first<{ n: number }>();
  if ((pending?.n ?? 0) >= 20)
    return Response.json({ error: "invite_limit" }, { status: 429, headers });
  let invite;
  try {
    invite = await createInvite(
      context.env.DB,
      email,
      context.data.userId,
      groupId,
    );
  } catch (error) {
    if (error instanceof RangeError)
      return Response.json(
        {
          error: "invalid_email",
          message: "メールアドレスを確認してください。",
        },
        { status: 400, headers },
      );
    throw error;
  }
  const url = new URL(
    "/auth/invite",
    context.env.APP_ORIGIN || context.request.url,
  );
  url.searchParams.set("token", invite.token);
  if (body.language === "en") url.searchParams.set("lang", "en");
  let emailStatus: "not_requested" | "sent" | "failed" = "not_requested";
  if (
    body.sendEmail &&
    invite.email &&
    context.env.INVITE_MAILER &&
    context.env.INVITE_FROM_EMAIL
  ) {
    try {
      const delivered = await context.env.INVITE_MAILER.fetch(
        "https://mailer/send",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            to: invite.email,
            url: url.toString(),
            expiresAt: invite.expiresAt,
            language: body.language ?? "ja",
          }),
        },
      );
      if (!delivered.ok) {
        console.error(
          JSON.stringify({
            event: "invitation_mailer_rejected",
            status: delivered.status,
          }),
        );
        emailStatus = "failed";
      } else {
        emailStatus = "sent";
      }
    } catch {
      // Preserve the usable link and report failure accurately, without logging
      // recipient addresses or bearer tokens.
      emailStatus = "failed";
      console.error(JSON.stringify({ event: "invitation_mailer_unavailable" }));
    }
  }
  return Response.json(
    {
      id: invite.id,
      email: invite.email,
      expiresAt: invite.expiresAt,
      url: url.toString(),
      emailStatus,
    },
    { status: 201, headers },
  );
};
export const onRequestDelete: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (
    !authorized(context) ||
    !(await registeredProfileUser(context.env, context.data))
  )
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id)
    return Response.json({ error: "invalid_id" }, { status: 400, headers });
  await context.env.DB.prepare(
    `UPDATE signup_invites SET revoked_at = ? WHERE id = ? AND (? = 'admin' OR invited_by = ?) AND accepted_at IS NULL AND revoked_at IS NULL`,
  )
    .bind(
      new Date().toISOString(),
      id,
      context.data.authUser.role,
      context.data.userId,
    )
    .run();
  return Response.json({ ok: true }, { headers });
};
