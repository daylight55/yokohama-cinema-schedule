import { LinkIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { localize, localeCode } from "./i18n";
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
  const [panel, setPanel] = useState<"invites" | "users">("invites");
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
          language: data.get("language"),
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
    <PageShell
      className="account-page admin-users-page"
      label={localize("ユーザー管理")}
    >
      <PageHeader
        eyebrow={localize("管理者用")}
        title={localize("ユーザー管理")}
      />
      {localize(
        error && (
          <p className="account-message error" role="alert">
            {localize(error)}
          </p>
        ),
      )}
      {localize(
        message && (
          <p className="account-message success" role="status">
            {localize(message)}
          </p>
        ),
      )}
      {localize(
        !account ? (
          <p>{localize("読み込み中…")}</p>
        ) : account.user.role !== "admin" ? (
          <p>{localize("管理者のみ利用できます。")}</p>
        ) : account.user.legacy ? (
          <p>
            {localize(
              "先にマイページで管理者のGoogleアカウントを連携してください。",
            )}
          </p>
        ) : (
          <>
            <div
              className="admin-tabs"
              role="tablist"
              aria-label={localize("ユーザー管理")}
            >
              {(["invites", "users"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  role="tab"
                  id={`admin-tab-${value}`}
                  aria-selected={panel === value}
                  aria-controls={`admin-panel-${value}`}
                  tabIndex={panel === value ? 0 : -1}
                  onClick={() => setPanel(value)}
                  onKeyDown={(event) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? "invites"
                          : event.key === "End"
                            ? "users"
                            : panel === "invites"
                              ? "users"
                              : "invites";
                      setPanel(next);
                      document.getElementById(`admin-tab-${next}`)?.focus();
                    }
                  }}
                >
                  {value === "invites" ? (
                    <LinkIcon size={18} aria-hidden="true" />
                  ) : (
                    <UsersThreeIcon size={18} aria-hidden="true" />
                  )}
                  {localize(value === "invites" ? "招待" : "登録ユーザー")}
                  {value === "users" && (
                    <span className="tab-count">{account.users.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id="admin-panel-invites"
              aria-labelledby="admin-tab-invites"
              hidden={panel !== "invites"}
            >
              <section className="account-section admin-invite-section">
                <h2>{localize("ユーザーを招待")}</h2>
                <p>{localize("24時間有効・1回限り")}</p>
                <form
                  onSubmit={issue}
                  className="admin-invite-form account-form"
                >
                  <label htmlFor="invite-language">
                    {localize("招待メールの言語")}
                  </label>
                  <select
                    id="invite-language"
                    name="language"
                    defaultValue={localeCode() === "en-GB" ? "en" : "ja"}
                  >
                    <option value="ja">日本語</option>
                    <option value="en">English</option>
                  </select>
                  <label htmlFor="invite-email">
                    {localize("登録を許可するGoogleメールアドレス（任意）")}
                  </label>
                  <input
                    id="invite-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                  />
                  {localize(
                    emailConfigured ? (
                      <label className="admin-checkbox">
                        <input type="checkbox" name="sendEmail" />
                        {localize("招待メールも送信する")}
                      </label>
                    ) : null,
                  )}
                  <button type="submit" disabled={busy}>
                    {localize(busy ? "処理中…" : "招待リンクを発行")}
                  </button>
                </form>
                {localize(
                  issued && (
                    <div className="admin-issued" role="status">
                      <strong>
                        {localize(
                          issued.emailStatus === "sent"
                            ? "招待メールを送信しました"
                            : "招待リンクを発行しました",
                        )}
                      </strong>
                      {localize(
                        issued.emailStatus === "failed" && (
                          <p className="account-message error">
                            {localize(
                              "メールを送信できませんでした。このリンクを共有するか、招待を取り消して再発行してください。",
                            )}
                          </p>
                        ),
                      )}
                      <label htmlFor="issued-link">
                        {localize("招待リンク")}
                      </label>
                      <input
                        id="issued-link"
                        value={issued.url}
                        readOnly
                        onFocus={(event) => event.target.select()}
                      />
                      <small>
                        {localize("有効期限：")}
                        {localize(
                          new Date(issued.expiresAt).toLocaleString(
                            localeCode(),
                          ),
                        )}
                      </small>
                      <button
                        className="account-secondary-button"
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(issued.url)
                            .then(() =>
                              setMessage("招待リンクをコピーしました。"),
                            )
                            .catch(() =>
                              setError(
                                "リンク欄を選択してコピーしてください。",
                              ),
                            );
                        }}
                      >
                        {localize("リンクをコピー")}
                      </button>
                    </div>
                  ),
                )}
              </section>
              <section className="account-section">
                <h2>{localize("招待一覧")}</h2>
                {localize(
                  invites.length === 0 ? (
                    <p>{localize("まだ招待はありません。")}</p>
                  ) : (
                    <ul className="account-user-list">
                      {localize(
                        invites.map((invite) => {
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
                                <strong>
                                  {invite.email ?? localize("共有リンク")}
                                </strong>
                                <small>
                                  {localize(status)}
                                  {localize("·")}
                                  {localize(" ")}
                                  {localize(
                                    new Date(invite.expires_at).toLocaleString(
                                      localeCode(),
                                    ),
                                  )}
                                  {localize("まで")}
                                </small>
                              </span>
                              {localize(
                                status === "登録待ち" && (
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
                                    {localize("取り消す")}
                                  </button>
                                ),
                              )}
                            </li>
                          );
                        }),
                      )}
                    </ul>
                  ),
                )}
              </section>
            </div>
            <div
              role="tabpanel"
              id="admin-panel-users"
              aria-labelledby="admin-tab-users"
              hidden={panel !== "users"}
            >
              <section className="account-section">
                <h2>{localize("登録ユーザー")}</h2>
                {localize(
                  account.users.length === 0 ? (
                    <p>{localize("まだ登録ユーザーはいません。")}</p>
                  ) : (
                    <ul className="account-user-list">
                      {localize(
                        account.users.map((user) => (
                          <li key={user.id}>
                            <span>
                              <strong>{user.email}</strong>
                              <small>
                                {localize(
                                  user.role === "admin" ? "管理者" : "メンバー",
                                )}
                                {localize("·")}
                                {localize(" ")}
                                {localize(
                                  user.status === "active" ? "有効" : "無効",
                                )}
                              </small>
                            </span>
                            <button
                              type="button"
                              disabled={busy || user.id === account.user.id}
                              onClick={() =>
                                void mutate("/api/account/users", "PATCH", {
                                  userId: user.id,
                                  status:
                                    user.status === "active"
                                      ? "disabled"
                                      : "active",
                                })
                              }
                            >
                              {localize(
                                user.status === "active" ? "無効化" : "有効化",
                              )}
                            </button>
                          </li>
                        )),
                      )}
                    </ul>
                  ),
                )}
              </section>
            </div>
          </>
        ),
      )}
    </PageShell>
  );
}
