import { invitationFailureReason } from "../shared/invitation-diagnostics";

export interface WithdrawalMailEnv {
  DB: D1Database;
  EMAIL: SendEmail;
  INVITE_FROM_EMAIL?: string;
}

export function withdrawalMessage(language: string, deleteAfter: string) {
  const english = language === "en";
  const deadline = new Intl.DateTimeFormat(english ? "en-GB" : "ja-JP", {
    timeZone: "Asia/Tokyo", dateStyle: "long", timeStyle: "short",
  }).format(new Date(deleteAfter));
  const paragraphs = english ? [
    "Thank you for using Hama Movie!",
    "Your account closure is complete. You have been signed out, and your shared plans and profile are no longer visible.",
    `Your data will be retained until ${deadline} (Japan time). Sign in before then to restore your account. Otherwise, your data will be automatically deleted after that deadline.`,
    "Thank you for letting us be part of your movie-going life.",
  ] : [
    "はまむび！をご利用いただき、ありがとうございました。",
    "退会手続きが完了しました。ログアウトされ、共有していた予定やプロフィールは表示されなくなりました。",
    `データの保持期限は${deadline}（日本時間）です。期限前に再ログインすると復帰できます。再ログインせず期限を過ぎると、データは自動で削除されます。`,
    "これまで映画ライフのお手伝いができたことに感謝いたします。",
  ];
  return {
    subject: english ? "Your Hama Movie! account is closed" : "【はまむび！】退会手続きが完了しました",
    text: paragraphs.join("\n\n"),
    html: paragraphs.map(p => `<p>${p}</p>`).join(""),
  };
}

/** Lease each message before sending so cron and the immediate request cannot overlap. */
export async function deliverWithdrawalEmails(env: WithdrawalMailEnv, userId?: string, now = new Date()): Promise<void> {
  if (!env.INVITE_FROM_EMAIL) throw new Error("withdrawal_email_not_configured");
  const rows = await env.DB.prepare(`SELECT id FROM account_withdrawal_emails
    WHERE sent_at IS NULL AND next_attempt_at<=? ${userId ? "AND user_id=?" : ""}
    ORDER BY next_attempt_at LIMIT 10`).bind(...(userId ? [now.toISOString(), userId] : [now.toISOString()]))
    .all<{ id: string }>();
  for (const { id } of rows.results) {
    const lease = crypto.randomUUID();
    const claimed = await env.DB.prepare(`UPDATE account_withdrawal_emails SET lease_token=?,
      next_attempt_at=?,attempts=attempts+1 WHERE id=? AND sent_at IS NULL AND next_attempt_at<=?`)
      .bind(lease, new Date(now.getTime() + 5 * 60_000).toISOString(), id, now.toISOString()).run();
    if (claimed.meta.changes !== 1) continue;
    const row = await env.DB.prepare(`SELECT q.delete_after,q.language,q.attempts,u.email FROM account_withdrawal_emails q
      JOIN users u ON u.id=q.user_id WHERE q.id=? AND q.lease_token=?`).bind(id, lease)
      .first<{ delete_after: string; language: string; attempts: number; email: string }>();
    if (!row) continue;
    try {
      await env.EMAIL.send({
        to: row.email,
        from: { email: env.INVITE_FROM_EMAIL, name: row.language === "en" ? "Hama Movie!" : "はまむび！" },
        ...withdrawalMessage(row.language, row.delete_after),
      });
      await env.DB.prepare("UPDATE account_withdrawal_emails SET sent_at=?,lease_token=NULL WHERE id=? AND lease_token=?")
        .bind(now.toISOString(), id, lease).run();
      console.info(JSON.stringify({ event: "withdrawal_email_accepted" }));
    } catch (error) {
      await env.DB.prepare("UPDATE account_withdrawal_emails SET next_attempt_at=?,lease_token=NULL WHERE id=? AND lease_token=?")
        .bind(new Date(now.getTime() + Math.min(60, 2 ** Math.min(row.attempts, 6)) * 60_000).toISOString(), id, lease).run();
      console.error(JSON.stringify({ event: "withdrawal_email_failed", reason: invitationFailureReason(error) }));
    }
  }
}
