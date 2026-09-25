import { useEffect, useState, type FormEvent } from "react";
import type { AccountResponse } from "../shared/types";
import { PageHeader, PageShell } from "./PageLayout";
interface Invite {
  id: string;
  email: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}
interface IssuedInvite {
  url: string;
  expiresAt: string;
  emailStatus: "sent" | "failed" | "not_requested";
}
export function AdminUsersPage() {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    const response = await fetch("/api/account");
    if (!response.ok) throw new Error("ユーザー情報を読み込めませんでした。");
    const data: AccountResponse = await response.json();
    setAccount(data);
    if (data.user.role !== "admin") return;
    const list = await fetch("/api/account/invites");
    if (!list.ok) throw new Error("招待一覧を読み込めませんでした。");
    const payload = (await list.json()) as {
      invites: Invite[];
      emailConfigured: boolean;
    };
    setInvites(payload.invites);
    setEmailConfigured(payload.emailConfigured);
  }
  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
  }, []);
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setMessage("");
    setIssued(null);
    try {
      const response = await fetch("/api/account/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          sendEmail: data.get("sendEmail") === "on",
        }),
      });
      const payload = (await response.json()) as IssuedInvite & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ?? "招待リンクを発行できませんでした。",
        );
      setIssued(payload);
      form.reset();
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "招待リンクを発行できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function mutate(url: string, method: string, body?: object) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error("変更を保存できませんでした。");
      setIssued(null);
      await load();
      setMessage("変更を保存しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "変更を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageShell className="account-page admin-users-page" label="ユーザー管理">
      <PageHeader
        eyebrow="管理者用"
        title="ユーザー管理"
        lead="招待リンクから、新しいユーザーを登録できます。"
      />
      <a href="#account">マイページへ</a>
      {error && (
        <p className="account-message error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="account-message success" role="status">
          {message}
        </p>
      )}
      {!account ? (
        <p>読み込み中…</p>
      ) : account.user.role !== "admin" ? (
        <p>管理者のみ利用できます。</p>
      ) : account.user.legacy ? (
        <p>先にマイページで管理者のGoogleアカウントを連携してください。</p>
      ) : (
        <>
          <section className="account-section">
            <h2>ユーザーを招待</h2>
            <p>
              有効期限は24時間、1人1回限りです。LINEなどでリンクを共有できます。
            </p>
            <form onSubmit={issue} className="admin-invite-form account-form">
              <label htmlFor="invite-email">招待先メールアドレス（任意）</label>
              <input
                id="invite-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                aria-describedby="invite-email-help"
              />
              <small id="invite-email-help">
                指定すると、そのアドレスのGoogleアカウントだけが登録できます。
              </small>
              {emailConfigured ? (
                <label className="admin-checkbox">
                  <input type="checkbox" name="sendEmail" />
                  招待メールも送信する
                </label>
              ) : (
                <small>
                  メール送信は設定待ちです。招待リンクは発行できます。
                </small>
              )}
              <button type="submit" disabled={busy}>
                {busy ? "処理中…" : "招待リンクを発行"}
              </button>
            </form>
            {issued && (
              <div className="admin-issued" role="status">
                <strong>
                  {issued.emailStatus === "sent"
                    ? "招待メールを送信しました"
                    : "招待リンクを発行しました"}
                </strong>
                {issued.emailStatus === "failed" && (
                  <p className="account-message error">
                    メールを送信できませんでした。このリンクを共有するか、招待を取り消して再発行してください。
                  </p>
                )}
                <label htmlFor="issued-link">招待リンク</label>
                <input
                  id="issued-link"
                  value={issued.url}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
                <small>
                  有効期限：{new Date(issued.expiresAt).toLocaleString("ja-JP")}
                </small>
                <button
                  className="account-secondary-button"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(issued.url)
                      .then(() => setMessage("招待リンクをコピーしました。"))
                      .catch(() =>
                        setError("リンク欄を選択してコピーしてください。"),
                      );
                  }}
                >
                  リンクをコピー
                </button>
              </div>
            )}
          </section>
          <section className="account-section">
            <h2>招待一覧</h2>
            {invites.length === 0 ? (
              <p>まだ招待はありません。</p>
            ) : (
              <ul className="account-user-list">
                {invites.map((invite) => {
                  const status = invite.accepted_at
                    ? "登録済み"
                    : invite.revoked_at
                      ? "取り消し済み"
                      : Date.parse(invite.expires_at) <= Date.now()
                        ? "期限切れ"
                        : "登録待ち";
                  return (
                    <li key={invite.id}>
                      <span>
                        <strong>{invite.email ?? "共有リンク"}</strong>
                        <small>
                          {status} ·{" "}
                          {new Date(invite.expires_at).toLocaleString("ja-JP")}
                          まで
                        </small>
                      </span>
                      {status === "登録待ち" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              `/api/account/invites?id=${encodeURIComponent(invite.id)}`,
                              "DELETE",
                            )
                          }
                        >
                          取り消す
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="account-section">
            <h2>登録ユーザー</h2>
            {account.users.length === 0 ? (
              <p>まだ登録ユーザーはいません。</p>
            ) : (
              <ul className="account-user-list">
                {account.users.map((user) => (
                  <li key={user.id}>
                    <span>
                      <strong>{user.email}</strong>
                      <small>
                        {user.role === "admin" ? "管理者" : "メンバー"} ·{" "}
                        {user.status === "active" ? "有効" : "無効"}
                      </small>
                    </span>
                    <button
                      type="button"
                      disabled={busy || user.id === account.user.id}
                      onClick={() =>
                        void mutate("/api/account/users", "PATCH", {
                          userId: user.id,
                          status:
                            user.status === "active" ? "disabled" : "active",
                        })
                      }
                    >
                      {user.status === "active" ? "無効化" : "有効化"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}
