import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader, PageShell } from "../../src/PageLayout";
import { translate } from "../../shared/i18n";
import { languageCookie, requestLanguage } from "../../shared/language";
import { restorationCookie, restorationProof } from "../_lib/account-restoration";
import { createUserSession, sessionCookie } from "../_lib/auth";
import type { PagesEnv } from "../_lib/env";

function cancelled(): Response {
  return new Response(null, { status: 303, headers: {
    location: "/auth/login", "cache-control": "no-store", "set-cookie": restorationCookie(),
  } });
}

export const onRequestGet: PagesFunction<PagesEnv> = async ({ request, env }) => {
  if (!(await restorationProof(request, env))) return cancelled();
  const language = requestLanguage(request);
  const t = (text: string) => translate(text, language);
  const title = t("アカウントを復旧しますか？");
  const description = t("復旧すると、保存していたプロフィールや鑑賞予定を再び利用でき、グループ内での共有も再開します。");
  const actions = h("form", { method: "post", action: "/auth/restore", id: "restore-actions" },
    h("button", { type: "submit", name: "action", value: "cancel", autoFocus: true }, t("キャンセル")),
    h("button", { type: "submit", name: "action", value: "restore", className: "primary" }, t("復旧してログイン")));
  const content = renderToStaticMarkup(h(PageShell, { children: [
    h(PageHeader, { key: "header", eyebrow: t("はまむび！"), title: t("退会後のログイン") }),
    h("dialog", { key: "dialog", id: "restore-dialog", open: true, "aria-labelledby": "restore-title", "aria-describedby": "restore-description" },
      h("h2", { id: "restore-title" }, title),
      h("p", { id: "restore-description" }, description),
      h("p", null, t("キャンセルすると退会状態のままとなり、元の削除期限も変わりません。")), actions),
  ] }));
  return new Response(`<!doctype html><html lang="${language}"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive"><title>${title}</title>
    <link rel="stylesheet" href="/base-theme.css"><link rel="stylesheet" href="/page-layout.css">
    <script src="/account-restore.js" defer></script>
    <style>*{box-sizing:border-box}body{margin:0}dialog{width:min(440px,calc(100% - 24px));max-height:calc(100dvh - 24px);overflow-y:auto;padding:20px;border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--text)}dialog::backdrop{background:rgb(0 0 0 / 65%)}h2{margin:0 0 16px;font-size:1.2rem;overflow-wrap:anywhere}p{line-height:1.7;overflow-wrap:anywhere}form{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}button{flex:1 1 140px;min-width:0;min-height:44px;padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface-raised);color:var(--text);font:inherit;cursor:pointer}.primary{background:var(--accent);color:var(--accent-ink)}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}button:disabled{opacity:.6}</style>
    </head><body><main>${content}</main></body></html>`, { headers: {
      "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
      // Same-origin forms need their Origin header for the CSRF check below.
      "set-cookie": languageCookie(language), "referrer-policy": "same-origin",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    } });
};

export const onRequestPost: PagesFunction<PagesEnv> = async ({ request, env }) => {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const data = await request.formData();
  if (data.get("action") === "cancel") return cancelled();
  if (data.get("action") !== "restore") return new Response("Invalid action", { status: 400 });
  const proof = await restorationProof(request, env);
  if (!proof) return cancelled();
  try {
    const session = await createUserSession(env, proof.userId, proof.withdrawnAt);
    const headers = new Headers({ location: `/${proof.returnHash}`, "cache-control": "no-store" });
    headers.append("set-cookie", sessionCookie(session.value, session.maxAge));
    headers.append("set-cookie", restorationCookie());
    return new Response(null, { status: 303, headers });
  } catch { return cancelled(); }
};
