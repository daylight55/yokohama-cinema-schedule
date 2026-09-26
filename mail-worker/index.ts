interface Env {
  EMAIL: SendEmail;
  INVITE_FROM_EMAIL?: string;
  APP_ORIGIN: string;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // This Worker has no public route; only the Pages service binding can call it.
    if (request.method !== "POST" || new URL(request.url).pathname !== "/send")
      return new Response("Not found", { status: 404 });
    if (!env.INVITE_FROM_EMAIL)
      return new Response("Email not configured", { status: 503 });
    const body = await request.json<{
      to: string;
      url: string;
      expiresAt: string;
      language?: string;
    }>();
    const url = new URL(body.url);
    if (
      url.origin !== env.APP_ORIGIN ||
      url.pathname !== "/auth/invite" ||
      !/^[a-f0-9]{64}$/.test(url.searchParams.get("token") ?? "")
    )
      return new Response("Invalid invitation", { status: 400 });
    const english = body.language === "en";
    const link = `${env.APP_ORIGIN}/auth/invite?token=${url.searchParams.get("token")}${english ? "&amp;lang=en" : ""}`;
    try {
      await env.EMAIL.send({
        to: body.to,
        from: {
          email: env.INVITE_FROM_EMAIL,
          name: english ? "Hama Movie!" : "はまむび！",
        },
        subject: english
          ? "Your Hama Movie! invitation (valid for 24 hours)"
          : "はまむび！への招待（24時間有効）",
        text: english
          ? `You are invited to Hama Movie! Sign up using the Google account for this email address.
${url}
Expires: ${body.expiresAt}
This link can be used once by one person. If you did not expect this invitation, ignore this email.`
          : `はまむび！に招待されました。次のリンクから、このメールアドレスのGoogleアカウントで登録してください。\n${url}\n有効期限: ${body.expiresAt}\nリンクは1人1回限り有効です。心当たりがなければ、このメールは破棄してください。`,
        html: english
          ? `<p>You are invited to Hama Movie!</p><p>Sign up using the Google account for this email address.</p><p><a href="${link}">Accept invitation</a></p><p>Valid for 24 hours from issue, once per person. If you did not expect this invitation, ignore this email.</p>`
          : `<p>はまむび！に招待されました。</p><p>このメールアドレスのGoogleアカウントで登録してください。</p><p><a href="${env.APP_ORIGIN}/auth/invite?token=${url.searchParams.get("token")}">招待を受け取る</a></p><p>リンクは発行から24時間、1人1回限り有効です。心当たりがなければ、このメールは破棄してください。</p>`,
      });
      return Response.json({ sent: true });
    } catch {
      return Response.json({ error: "email_delivery_failed" }, { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
