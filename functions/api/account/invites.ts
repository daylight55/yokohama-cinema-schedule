import { isLanguage } from "../../../shared/language";
import { createInvite, type SignupInvite } from "../../_lib/invitations";
import type { AuthContextData, PagesEnv } from "../../_lib/env";

const headers = { "cache-control": "private, no-store" };
function authorized(context: {
  data: AuthContextData;
  request: Request;
}): boolean {
  return (
    context.data.authUser.role === "admin" &&
    context.request.headers.get("origin") ===
      new URL(context.request.url).origin
  );
}
export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.data.authUser.role !== "admin")
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const result = await context.env.DB.prepare(
    `SELECT id, email, created_at, expires_at, accepted_at, revoked_at FROM signup_invites ORDER BY created_at DESC LIMIT 100`,
  ).all<SignupInvite>();
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
  if (!authorized(context))
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
  let body: { email?: unknown; sendEmail?: unknown; language?: unknown };
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
    (body.language !== undefined && !isLanguage(body.language))
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
  let invite;
  try {
    invite = await createInvite(context.env.DB, email, context.data.userId);
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
      if (!delivered.ok) throw new Error("email_delivery_failed");
      emailStatus = "sent";
    } catch {
      // Preserve the usable link and report failure accurately, without logging
      // recipient addresses or bearer tokens.
      emailStatus = "failed";
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
  if (!authorized(context))
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id)
    return Response.json({ error: "invalid_id" }, { status: 400, headers });
  await context.env.DB.prepare(
    `UPDATE signup_invites SET revoked_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
  )
    .bind(new Date().toISOString(), id)
    .run();
  return Response.json({ ok: true }, { headers });
};
