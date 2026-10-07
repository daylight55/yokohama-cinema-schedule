import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import { accountCanLogin, accountDeletionDeadline, purgeExpiredAccounts, withdrawAccount } from "../shared/account-lifecycle";
import { createUserSession, resolveSession, saveUserPassword } from "../functions/_lib/auth";
import { onRequestPost as passwordLogin } from "../functions/auth/password/login";
import { onRequestPost as withdrawal } from "../functions/api/account/withdraw";
import { completeGoogleLogin } from "../functions/_lib/accounts";
import type { PagesEnv } from "../functions/_lib/env";
import { authenticatedLogin } from "../functions/_lib/account-restoration";
import { onRequestGet as restorePage, onRequestPost as restoreAccount } from "../functions/auth/restore";
const instant = "2026-01-31T01:23:00.000Z";
function seed() {
  const data = testDatabase();
  data.sqlite.exec(`INSERT INTO users(id,email,created_at,updated_at) VALUES ('member','member@example.com','now','now');
    INSERT INTO member_profiles(user_id,display_name,bio,avatar,avatar_type,updated_at) VALUES ('member','Test','Bio',X'010203','image/png','now');
    INSERT INTO app_preferences VALUES ('member','example','kept','now');`);
  return data;
}
afterEach(() => vi.useRealTimers());
describe("account withdrawal lifecycle", () => {
  it("uses a calendar month in JST, clamping short months including leap years", () => {
    expect(accountDeletionDeadline(new Date(instant))).toBe("2026-02-28T01:23:00.000Z");
    expect(accountDeletionDeadline(new Date("2024-01-31T01:00:00Z"))).toBe("2024-02-29T01:00:00.000Z");
    expect(accountDeletionDeadline(new Date("2026-12-31T15:30:00Z"))).toBe("2027-01-31T15:30:00.000Z");
  });
  it("revokes sessions and restores only after valid password authentication and explicit confirmation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(instant));
    const { db, sqlite } = seed(); const env = { DB: db, SESSION_SECRET: "test-restoration-secret" } as PagesEnv;
    try {
      await saveUserPassword(db, "member", "local-lifecycle-test-password");
      const sessions = await Promise.all([createUserSession(env, "member"), createUserSession(env, "member")]);
      expect(await withdrawAccount(db, "member")).toBe("2026-02-28T01:23:00.000Z");
      expect(await withdrawAccount(db, "member")).toBeNull();
      expect(sqlite.prepare("SELECT count(*) n FROM user_sessions").get()?.n).toBe(0);
      expect(sqlite.prepare("SELECT count(*) n FROM member_profiles").get()?.n).toBe(1);
      expect(await resolveSession(new Request("https://example.org", { headers: {cookie:`yc_session=${sessions[0].value}`} }),env)).toBeNull();
      const attempt = (password: string) => passwordLogin({ env, request: new Request("https://example.org/auth/password/login", {
        method:"POST", body:new URLSearchParams({ email:"member@example.com",password }),
      }) } as Parameters<typeof passwordLogin>[0]);
      expect((await attempt("wrong")).status).toBe(401);
      expect(sqlite.prepare("SELECT status FROM users WHERE id='member'").get()?.status).toBe("disabled");
      vi.setSystemTime(new Date("2026-02-28T01:22:59Z"));
      const login = await attempt("local-lifecycle-test-password");
      expect(login.headers.get("location")).toBe("/auth/restore");
      expect(sqlite.prepare("SELECT status FROM users WHERE id='member'").get()?.status).toBe("disabled");
      expect(sqlite.prepare("SELECT count(*) n FROM user_sessions").get()?.n).toBe(0);
      const confirmation = await restoreAccount({ env, request: new Request("https://example.org/auth/restore", {
        method: "POST", headers: { origin: "https://example.org", cookie: login.headers.get("set-cookie")!.split(";")[0] },
        body: new URLSearchParams({ action: "restore" }),
      }) } as Parameters<typeof restoreAccount>[0]);
      expect(confirmation.status).toBe(303);
      expect(confirmation.headers.get("set-cookie")).toContain("yc_session=v2.");
      expect(sqlite.prepare("SELECT status,delete_after,withdrawn_at FROM users WHERE id='member'").get())
        .toEqual({ status:"active",delete_after:null,withdrawn_at:null });
      expect(await purgeExpiredAccounts(db,"2026-03-01T00:00:00Z")).toBe(0);
    } finally { sqlite.close(); }
  });
  it("rejects expired restorations before cron and deletes related data and invite references atomically", async () => {
    vi.useFakeTimers({ toFake:["Date"] }); vi.setSystemTime(new Date(instant));
    const { db, sqlite }=seed();
    try {
      sqlite.exec(`INSERT INTO signup_invites(id,token_hash,email,invited_by,created_at,expires_at,accepted_by) VALUES
        ('out','hash1','someone@example.org','member','2026-01-31T00:00:00.000Z','2026-02-01T00:00:00.000Z',NULL),
        ('in','hash2','member@example.com','legacy-local','2026-01-31T00:00:00.000Z','2026-02-01T00:00:00.000Z','member');
        INSERT INTO user_auth_identities VALUES('google','sub','member','member@example.com','now','now');`);
      const deadline=(await withdrawAccount(db,"member"))!;
      vi.setSystemTime(new Date(deadline));
      expect(await accountCanLogin(db,"member")).toBe(false);
      await expect(createUserSession({DB:db} as PagesEnv,"member")).rejects.toThrow("user_disabled");
      await expect(completeGoogleLogin(db,{subject:"sub",email:"member@example.com",emailVerified:true},null,"unused")).rejects.toThrow("user_disabled");
      expect(await purgeExpiredAccounts(db)).toBe(1);
      expect(await purgeExpiredAccounts(db)).toBe(0);
      for(const table of ["member_profiles","app_preferences","signup_invites","user_auth_identities"])
        expect(sqlite.prepare(`SELECT count(*) n FROM ${table}${table === "signup_invites" ? "" : " WHERE user_id='member'"}`).get()?.n).toBe(0);
    } finally { sqlite.close(); }
  });
  it("allows Google credential verification within retention but never revives an admin-disabled user", async () => {
    const {db,sqlite}=seed();
    try {
      sqlite.exec("INSERT INTO user_auth_identities VALUES('google','sub','member','member@example.com','now','now')");
      await withdrawAccount(db,"member");
      const user=await completeGoogleLogin(db,{subject:"sub",email:"member@example.com",emailVerified:true},null,"unused");
      await expect(createUserSession({DB:db} as PagesEnv,user.id)).rejects.toThrow("user_disabled");
      sqlite.exec("UPDATE users SET status='disabled',withdrawn_at=NULL,delete_after=NULL WHERE id='member'");
      expect(await accountCanLogin(db,"member")).toBe(false);
      await expect(createUserSession({DB:db} as PagesEnv,"member")).rejects.toThrow("user_disabled");
    } finally {sqlite.close();}
  });
  it("requires same-origin authenticated self-withdrawal",async()=>{
    const {db,sqlite}=seed();
    try{
      const invoke=(origin:string,legacySession=false)=>withdrawal({env:{DB:db},data:{userId:"member",authUser:{status:"active"},legacySession},
        request:new Request("https://example.org/api/account/withdraw",{method:"POST",headers:{origin}})} as Parameters<typeof withdrawal>[0]);
      expect((await invoke("https://evil.example")).status).toBe(403);
      expect((await invoke("https://example.org",true)).status).toBe(403);
      const response=await invoke("https://example.org");expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    }finally{sqlite.close();}
  });
  it("keeps withdrawal and its deadline when visiting or cancelling the confirmation", async () => {
    const { db, sqlite } = seed(); const env = { DB: db, SESSION_SECRET: "test-restoration-secret" } as PagesEnv;
    try {
      const deadline = await withdrawAccount(db, "member");
      const result = await authenticatedLogin(env, "member", "#account");
      const cookie = result.restoreCookie!.split(";")[0];
      expect(result.restoreCookie).toContain("HttpOnly; Secure; SameSite=Lax; Max-Age=600");
      const request = new Request("https://example.org/auth/restore?lang=en", { headers: { cookie } });
      expect(await resolveSession(request, env)).toBeNull();
      const page = await restorePage({ request, env } as Parameters<typeof restorePage>[0]);
      expect(await page.text()).toContain("Restore your account?");
      const cancel = await restoreAccount({ env, request: new Request(request.url, {
        method: "POST", headers: { cookie, origin: "https://example.org" }, body: new URLSearchParams({ action: "cancel" }),
      }) } as Parameters<typeof restoreAccount>[0]);
      expect(cancel.headers.get("set-cookie")).toContain("Max-Age=0");
      expect(sqlite.prepare("SELECT status,delete_after FROM users WHERE id='member'").get()).toEqual({ status: "disabled", delete_after: deadline });
      expect(sqlite.prepare("SELECT count(*) n FROM user_sessions").get()?.n).toBe(0);
    } finally { sqlite.close(); }
  });
  it("rejects missing/tampered proofs, cross-origin confirmation, and replay after another withdrawal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(instant));
    const { db, sqlite } = seed(); const env = { DB: db, SESSION_SECRET: "test-restoration-secret" } as PagesEnv;
    try {
      await withdrawAccount(db, "member");
      const result = await authenticatedLogin(env, "member", "#account");
      const cookie = result.restoreCookie!.split(";")[0];
      const confirm = (cookieValue = cookie, origin = "https://example.org") => restoreAccount({ env,
        request: new Request("https://example.org/auth/restore", { method: "POST", headers: { cookie: cookieValue, origin },
          body: new URLSearchParams({ action: "restore" }) }),
      } as Parameters<typeof restoreAccount>[0]);
      expect((await confirm(cookie, "https://evil.example")).status).toBe(403);
      for (const bad of ["", `${cookie}tampered`]) expect((await confirm(bad)).headers.get("location")).toBe("/auth/login");
      expect(sqlite.prepare("SELECT status FROM users WHERE id='member'").get()?.status).toBe("disabled");
      const success = await confirm();
      expect(success.headers.get("location")).toBe("/#account");
      expect(await resolveSession(new Request("https://example.org", { headers: {
        cookie: success.headers.get("set-cookie")!.split(";")[0],
      } }), env)).not.toBeNull();
      expect((await confirm()).headers.get("location")).toBe("/auth/login");
      expect(sqlite.prepare("SELECT count(*) n FROM user_sessions").get()?.n).toBe(1);
      vi.setSystemTime(new Date(new Date(instant).getTime() + 1000));
      await withdrawAccount(db, "member");
      expect((await confirm()).headers.get("location")).toBe("/auth/login");
      expect(sqlite.prepare("SELECT status FROM users WHERE id='member'").get()?.status).toBe("disabled");
    } finally { sqlite.close(); }
  });
  it("rejects a stale confirmation, a deletion deadline reached while confirming, and admin suspension", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(instant));
    const { db, sqlite } = seed(); const env = { DB: db, SESSION_SECRET: "test-restoration-secret" } as PagesEnv;
    try {
      const deadline = await withdrawAccount(db, "member");
      const confirmation = async () => {
        const result = await authenticatedLogin(env, "member");
        return new Request("https://example.org/auth/restore", { headers: { cookie: result.restoreCookie!.split(";")[0] } });
      };
      const request = await confirmation();
      vi.setSystemTime(new Date(new Date(instant).getTime() + 600_000));
      expect((await restorePage({ env, request } as Parameters<typeof restorePage>[0])).status).toBe(303);
      vi.setSystemTime(new Date(new Date(deadline!).getTime() - 1000));
      const lastSecond = await confirmation();
      vi.setSystemTime(new Date(deadline!));
      expect((await restorePage({ env, request: lastSecond } as Parameters<typeof restorePage>[0])).status).toBe(303);
      vi.setSystemTime(new Date(instant));
      sqlite.exec("UPDATE users SET withdrawn_at=NULL,delete_after=NULL WHERE id='member'");
      expect((await restorePage({ env, request } as Parameters<typeof restorePage>[0])).status).toBe(303);
      await expect(authenticatedLogin(env, "member")).rejects.toThrow("user_disabled");
    } finally { sqlite.close(); }
  });
});
