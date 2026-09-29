import { invitationFailureReason } from "../shared/invitation-diagnostics";

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
    const link = `${env.APP_ORIGIN}/auth/invite?token=${url.searchParams.get("token")}${english ? "&lang=en" : ""}`;
    const htmlLink = link.replaceAll("&", "&amp;");
    const steps = english
      ? [
          "Open the invitation link below within 24 hours.",
          'Choose your display language, then select “Join with Google”.',
          "Choose the Google account for the email address that received this invitation and follow the Google prompts.",
          "When the shared page appears, you’re all set! Your plans and watchlist are shared in the group. Open the profile icon at the top right → My account to set your name and photo.",
        ]
      : [
          "24時間以内に、下の招待リンクを開いてね！",
          "表示言語を選んで「Googleで参加する」を押してね。",
          "このメールを受け取ったアドレスのGoogleアカウントを選び、画面の案内に沿って進めてね。",
          "共有画面が表示されたら参加完了だよ！予定と気になる作品をグループで共有するよ。右上のアイコン → マイページで、名前や写真を設定してね。",
        ];
    const fallback = english
      ? "If signup won’t open inside LINE or another app, open the invitation link in Safari or Chrome."
      : "LINEなどのアプリ内で登録が進まないときは、招待リンクをSafariやChromeで開いてね。";
    const textSteps = steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
    const htmlSteps = `<ol>${steps.map((step) => `<li>${step}</li>`).join("")}</ol>`;
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
          ? `You are invited to Hama Movie!

How to sign up
${textSteps}

Accept invitation: ${link}

${fallback}
Expires: ${body.expiresAt}
This link is valid for 24 hours from issue and can be used once by one person. If you did not expect this invitation, ignore this email.`
          : `はまむび！に招待されたよ！

登録のしかた
${textSteps}

招待を受け取る: ${link}

${fallback}
有効期限: ${body.expiresAt}
リンクは発行から24時間、1人1回限り有効です。心当たりがなければ、このメールは破棄してください。`,
        html: english
          ? `<p>You are invited to Hama Movie!</p><h2>How to sign up</h2>${htmlSteps}<p><a href="${htmlLink}">Accept invitation</a></p><p>${fallback}</p><p>Valid for 24 hours from issue, once per person. If you did not expect this invitation, ignore this email.</p>`
          : `<p>はまむび！に招待されたよ！</p><h2>登録のしかた</h2>${htmlSteps}<p><a href="${htmlLink}">招待を受け取る</a></p><p>${fallback}</p><p>リンクは発行から24時間、1人1回限り有効です。心当たりがなければ、このメールは破棄してください。</p>`,
      });
      console.info(JSON.stringify({ event: "invitation_email_accepted" }));
      return Response.json({ sent: true });
    } catch (error) {
      console.error(JSON.stringify({
        event: "invitation_email_failed",
        reason: invitationFailureReason(error),
      }));
      return Response.json({ error: "email_delivery_failed" }, { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
