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
    }>();
    const url = new URL(body.url);
    if (
      url.origin !== env.APP_ORIGIN ||
      url.pathname !== "/auth/invite" ||
      !/^[a-f0-9]{64}$/.test(url.searchParams.get("token") ?? "")
    )
      return new Response("Invalid invitation", { status: 400 });
    try {
      await env.EMAIL.send({
        to: body.to,
        from: { email: env.INVITE_FROM_EMAIL, name: "はまむび！" },
        subject: "はまむび！への招待（24時間有効）",
        text: `はまむび！に招待されました。次のリンクから、このメールアドレスのGoogleアカウントで登録してください。\n${url}\n有効期限: ${body.expiresAt}\nリンクは1人1回限り有効です。心当たりがなければ、このメールは破棄してください。`,
        html: `<p>はまむび！に招待されました。</p><p>このメールアドレスのGoogleアカウントで登録してください。</p><p><a href="${env.APP_ORIGIN}/auth/invite?token=${url.searchParams.get("token")}">招待を受け取る</a></p><p>リンクは発行から24時間、1人1回限り有効です。心当たりがなければ、このメールは破棄してください。</p>`,
      });
      return Response.json({ sent: true });
    } catch {
      return Response.json({ error: "email_delivery_failed" }, { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
