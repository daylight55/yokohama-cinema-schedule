import { describe, expect, it, vi } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import { withdrawAccount } from "../shared/account-lifecycle";
import { deliverWithdrawalEmails, withdrawalMessage } from "../mail-worker/withdrawal";
import { onRequestPost } from "../functions/api/account/withdraw";

const now = new Date("2026-09-29T03:00:00Z");
function fixture() {
  const { db, sqlite } = testDatabase();
  sqlite.exec("INSERT INTO users(id,email,language,created_at,updated_at) VALUES ('member','member@example.com','en','now','now')");
  const send = vi.fn().mockResolvedValue({ messageId: "accepted" });
  return { db, sqlite, send, env: { DB: db, EMAIL: { send } as unknown as SendEmail, INVITE_FROM_EMAIL: "noreply@notify.daylight55.dev" } };
}
describe("withdrawal completion mail", () => {
  it("queues only successful withdrawals and sends once to the stored account email in its language", async () => {
    const { db, sqlite, env, send } = fixture();
    try {
      await withdrawAccount(db, "member", now);
      await withdrawAccount(db, "member", now);
      expect(sqlite.prepare("SELECT count(*) n FROM account_withdrawal_emails").get()?.n).toBe(1);
      await Promise.all([deliverWithdrawalEmails(env, undefined, now), deliverWithdrawalEmails(env, "member", now)]);
      await deliverWithdrawalEmails(env, undefined, now);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "member@example.com", subject: "Your Hama Movie! account is closed", text: expect.stringContaining("29 October 2026") }));
    } finally { sqlite.close(); }
  });
  it("rolls back the queued email if the account change fails", async () => {
    const { db, sqlite, env, send } = fixture();
    try {
      sqlite.exec("CREATE TRIGGER fail_withdrawal BEFORE UPDATE OF withdrawn_at ON users BEGIN SELECT RAISE(ABORT, 'simulated failure'); END");
      await expect(withdrawAccount(db, "member", now)).rejects.toThrow("simulated failure");
      expect(sqlite.prepare("SELECT count(*) n FROM account_withdrawal_emails").get()?.n).toBe(0);
      expect(sqlite.prepare("SELECT status FROM users WHERE id='member'").get()?.status).toBe("active");
      await deliverWithdrawalEmails(env, undefined, now);
      expect(send).not.toHaveBeenCalled();
    } finally { sqlite.close(); }
  });
  it("keeps failed delivery queued without undoing withdrawal and retries after backoff", async () => {
    const { db, sqlite, env, send } = fixture();
    try {
      await withdrawAccount(db, "member", now);
      send.mockRejectedValueOnce(new Error("temporary failure"));
      await deliverWithdrawalEmails(env, undefined, now);
      expect(sqlite.prepare("SELECT status FROM users WHERE id='member'").get()?.status).toBe("disabled");
      expect(sqlite.prepare("SELECT sent_at FROM account_withdrawal_emails").get()?.sent_at).toBeNull();
      await deliverWithdrawalEmails(env, undefined, now);
      expect(send).toHaveBeenCalledTimes(1);
      await deliverWithdrawalEmails(env, undefined, new Date(now.getTime() + 2 * 60_000));
      expect(send).toHaveBeenCalledTimes(2);
      expect(sqlite.prepare("SELECT sent_at FROM account_withdrawal_emails").get()?.sent_at).not.toBeNull();
    } finally { sqlite.close(); }
  });
  it("recovers abandoned leases and removes queued messages when account data is purged", async () => {
    const { db, sqlite, env, send } = fixture();
    try {
      await withdrawAccount(db, "member", now);
      sqlite.exec(`UPDATE account_withdrawal_emails SET lease_token='abandoned', next_attempt_at='2026-09-29T03:05:00.000Z'`);
      await deliverWithdrawalEmails(env, undefined, now);
      expect(send).not.toHaveBeenCalled();
      await deliverWithdrawalEmails(env, undefined, new Date("2026-09-29T03:06:00Z"));
      expect(send).toHaveBeenCalledTimes(1);
      sqlite.exec("DELETE FROM users WHERE id='member'");
      expect(sqlite.prepare("SELECT count(*) n FROM account_withdrawal_emails").get()?.n).toBe(0);
    } finally { sqlite.close(); }
  });
  it.each(["ja", "en"])("includes thanks, completion and retention in both %s formats", (language) => {
    const message = withdrawalMessage(language, "2026-10-29T03:00:00Z");
    for (const body of [message.text, message.html]) {
      expect(body).toContain(language === "ja" ? "ありがとうございました" : "Thank you");
      expect(body).toContain(language === "ja" ? "退会手続きが完了" : "closure is complete");
      expect(body).toContain(language === "ja" ? "自動で削除" : "automatically deleted");
    }
  });
  it("triggers the private mailer only after success, without trusting caller recipient data", async () => {
    const { db, sqlite } = fixture();
    const tasks: Promise<unknown>[] = [];
    const fetch = vi.fn().mockResolvedValue(new Response("ok"));
    const invoke = (origin: string) => onRequestPost({ env: { DB: db, INVITE_MAILER: { fetch } }, data: {userId:"member",authUser:{status:"active"},legacySession:false},
      request: new Request("https://example.org/api/account/withdraw", {method:"POST",headers:{origin},body:JSON.stringify({to:"attacker@example.com"})}), waitUntil: (p: Promise<unknown>)=>tasks.push(p),
    } as unknown as Parameters<typeof onRequestPost>[0]);
    try {
      expect((await invoke("https://evil.example")).status).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
      expect((await invoke("https://example.org")).status).toBe(200);
      await Promise.all(tasks);
      expect(fetch).toHaveBeenCalledWith("https://mailer/withdrawal", expect.objectContaining({ body: JSON.stringify({userId:"member"}) }));
      expect((await invoke("https://example.org")).status).toBe(403);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { sqlite.close(); }
  });
});
