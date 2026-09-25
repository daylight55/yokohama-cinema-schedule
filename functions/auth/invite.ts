import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader, PageShell } from "../../src/PageLayout";
import { findValidInvite } from "../_lib/invitations";
import type { PagesEnv } from "../_lib/env";

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  const token = new URL(context.request.url).searchParams.get("token") ?? "";
  const invite = await findValidInvite(context.env.DB, token);
  const googleConfigured = Boolean(
    context.env.GOOGLE_CLIENT_ID && context.env.GOOGLE_CLIENT_SECRET,
  );
  const title = invite ? "はまむび！への招待" : "この招待は利用できません";
  const text = invite
    ? `Googleアカウントで登録できます。${invite.email ? "招待メールを受け取ったアドレスのアカウントを選んでください。" : "このリンクで登録できるのは1人です。"}`
    : "期限切れ、使用済み、または取り消された招待です。管理者に新しいリンクを依頼してください。";
  const content = renderToStaticMarkup(
    h(PageShell, {
      label: title,
      children: [
        h(PageHeader, {
          key: "header",
          eyebrow: "横浜の映画館スケジュール",
          title,
          lead: text,
        }),
        ...(invite
          ? [
              h(
                "p",
                { key: "expiry" },
                `有効期限：${new Date(invite.expires_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（日本時間）`,
              ),
              googleConfigured
                ? h(
                    "a",
                    {
                      key: "register",
                      href: `/auth/google/login/start?invite=${token}`,
                    },
                    "Googleで登録する",
                  )
                : h(
                    "p",
                    { key: "unavailable" },
                    "現在、登録の準備中です。管理者にお問い合わせください。",
                  ),
              h(
                "small",
                { key: "browser" },
                "LINE内で開けない場合は、リンクをSafariやChromeで開いてください。",
              ),
            ]
          : [h("a", { key: "login", href: "/" }, "ログイン画面へ")]),
      ],
    }),
  );
  return new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><link rel="stylesheet" href="/base-theme.css"><link rel="stylesheet" href="/page-layout.css"><style>
  *{box-sizing:border-box}body{margin:0;line-height:1.7}p{color:var(--muted)}a{display:inline-flex;align-items:center;min-height:48px;padding:10px 18px;background:var(--accent);color:var(--accent-ink);border-radius:8px;text-decoration:none;font-weight:700}a:focus-visible{outline:3px solid var(--accent);outline-offset:4px}small{display:block;margin-top:20px;color:var(--muted)}</style></head><body><main>${content}</main></body></html>`,
    {
      status: invite ? 200 : 410,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-frame-options": "DENY",
        "x-content-type-options": "nosniff",
        "content-security-policy":
          "default-src 'none'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      },
    },
  );
};
