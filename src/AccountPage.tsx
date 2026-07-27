import {
  FingerprintIcon,
  GoogleLogoIcon,
  KeyIcon,
  TrashIcon,
  UserPlusIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import type { AccountResponse } from "../shared/types";

export function AccountPage() {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passkeyAvailable =
    window.isSecureContext &&
    "PublicKeyCredential" in window &&
    typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function";

  const loadAccount = async () => {
    const response = await fetch("/api/account", {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error();
    setAccount((await response.json()) as AccountResponse);
  };

  useEffect(() => {
    loadAccount().catch(() =>
      setError("アカウント情報を読み込めませんでした"),
    );
  }, []);

  const setPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation) {
      setError("確認用パスワードが一致しません");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/account/password", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "パスワードを保存できませんでした");
      }
      formElement.reset();
      setMessage("パスワードを保存しました");
      await loadAccount();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "パスワードを保存できませんでした",
      );
    } finally {
      setBusy(false);
    }
  };

  const registerPasskey = async () => {
    if (!passkeyAvailable) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const optionsResponse = await fetch(
        "/api/passkeys/register/options",
        {
          method: "POST",
          headers: { accept: "application/json" },
        },
      );
      if (!optionsResponse.ok) throw new Error();
      const payload = (await optionsResponse.json()) as {
        options: PublicKeyCredentialCreationOptionsJSON;
        challengeId: string;
      };
      const publicKey =
        PublicKeyCredential.parseCreationOptionsFromJSON(payload.options);
      const credential = await navigator.credentials.create({ publicKey });
      if (
        !(credential instanceof PublicKeyCredential) ||
        typeof credential.toJSON !== "function"
      ) {
        throw new Error();
      }
      const verifyResponse = await fetch(
        "/api/passkeys/register/verify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            challengeId: payload.challengeId,
            response: credential.toJSON(),
            name: devicePasskeyName(),
          }),
        },
      );
      if (!verifyResponse.ok) throw new Error();
      setMessage("パスキーを追加しました");
      await loadAccount();
    } catch (reason) {
      if (
        !(reason instanceof DOMException) ||
        !["AbortError", "NotAllowedError"].includes(reason.name)
      ) {
        setError("パスキーを追加できませんでした");
      }
    } finally {
      setBusy(false);
    }
  };

  const deletePasskey = async (id: string) => {
    if (!window.confirm("このパスキーを削除しますか？")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/passkeys?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error();
      await loadAccount();
    } catch {
      setError("パスキーを削除できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const email = String(new FormData(formElement).get("email") ?? "");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/invites", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error();
      formElement.reset();
      setMessage("ログイン許可リストに追加しました");
      await loadAccount();
    } catch {
      setError("メールアドレスを確認してください");
    } finally {
      setBusy(false);
    }
  };

  const updateUserStatus = async (
    userId: string,
    status: "active" | "disabled",
  ) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/users", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ userId, status }),
      });
      if (!response.ok) throw new Error();
      await loadAccount();
    } catch {
      setError("ユーザー状態を変更できませんでした");
    } finally {
      setBusy(false);
    }
  };

  if (!account) {
    return (
      <section className="account-page" aria-label="アカウント">
        <p>{error ?? "アカウント情報を読み込んでいます…"}</p>
      </section>
    );
  }

  const email = account.user.displayEmail ?? account.user.email;
  return (
    <section className="account-page" aria-label="アカウント">
      <header className="account-heading">
        <p>設定</p>
        <h1>アカウント</h1>
        <span>{email ?? "管理者用セッション"}</span>
      </header>

      {account.user.legacy && (
        <section className="account-notice">
          <strong>Googleアカウントを管理者として登録</strong>
          <p>
            今の映画設定を引き継いで、端末をまたいで使えるようにします。
          </p>
          {account.googleConfigured ? (
            <a href="/auth/google/login/start">Googleアカウントを連携</a>
          ) : (
            <small>Google OAuthの設定後に連携できます。</small>
          )}
        </section>
      )}

      {error && <p className="account-message error">{error}</p>}
      {message && <p className="account-message success">{message}</p>}

      {!account.user.legacy && (
        <>
          <section className="account-section">
            <div className="account-section-title account-google-row">
              <GoogleLogoIcon size={23} aria-hidden="true" />
              <div>
                <h2>Google</h2>
                <p>
                  {account.methods.google
                    ? "Googleアカウントをログインに使用しています。"
                    : "Googleアカウントを主なログイン方法にします。"}
                </p>
              </div>
              {account.methods.google ? (
                <strong className="account-method-status">連携済み</strong>
              ) : account.googleConfigured ? (
                <a
                  className="account-method-link"
                  href="/auth/google/login/start"
                >
                  連携
                </a>
              ) : (
                <small className="account-method-status">設定待ち</small>
              )}
            </div>
          </section>

          <section className="account-section">
            <div className="account-section-title">
              <KeyIcon size={22} aria-hidden="true" />
              <div>
                <h2>パスワード</h2>
                <p>Googleが使えないときの予備ログインです。</p>
              </div>
            </div>
            <form className="account-form" onSubmit={setPassword}>
              <input
                name="username"
                type="email"
                value={email ?? ""}
                autoComplete="username"
                readOnly
                hidden
              />
              <label>
                新しいパスワード
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={256}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label>
                確認
                <input
                  name="confirmation"
                  type="password"
                  minLength={12}
                  maxLength={256}
                  required
                  autoComplete="new-password"
                />
              </label>
              <button type="submit" disabled={busy}>
                {account.methods.password ? "更新する" : "設定する"}
              </button>
            </form>
          </section>

          <section className="account-section">
            <div className="account-section-title">
              <FingerprintIcon size={24} aria-hidden="true" />
              <div>
                <h2>パスキー</h2>
                <p>端末の顔・指紋・画面ロックでログインします。</p>
              </div>
            </div>
            {passkeyAvailable ? (
              <button
                className="account-secondary-button"
                type="button"
                disabled={busy}
                onClick={() => void registerPasskey()}
              >
                パスキーを追加
              </button>
            ) : (
              <p className="account-muted">
                この端末またはブラウザではパスキーを利用できません。
              </p>
            )}
            {account.passkeys.length > 0 && (
              <ul className="passkey-list">
                {account.passkeys.map((passkey) => (
                  <li key={passkey.id}>
                    <span>
                      <strong>{passkey.name}</strong>
                      <small>
                        {new Date(passkey.createdAt).toLocaleDateString("ja-JP")}
                        に追加
                      </small>
                    </span>
                    <button
                      type="button"
                      aria-label={`${passkey.name}を削除`}
                      disabled={busy}
                      onClick={() => void deletePasskey(passkey.id)}
                    >
                      <TrashIcon size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {account.user.role === "admin" && !account.user.legacy && (
        <section className="account-section">
          <div className="account-section-title">
            <UsersIcon size={24} aria-hidden="true" />
            <div>
              <h2>利用ユーザー</h2>
              <p>
                許可リストに追加したメールアドレスだけGoogleログインできます。
              </p>
            </div>
          </div>
          <form className="account-invite-form" onSubmit={invite}>
            <label>
              許可するメールアドレス
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
              />
            </label>
            <button type="submit" disabled={busy}>
              <UserPlusIcon size={18} aria-hidden="true" />
              追加
            </button>
          </form>
          {account.pendingInvites.length > 0 && (
            <div className="pending-invites">
              <strong>初回ログイン待ち</strong>
              {account.pendingInvites.map((invite) => (
                <span key={invite.email}>{invite.email}</span>
              ))}
            </div>
          )}
          <ul className="account-user-list">
            {account.users.map((user) => (
              <li key={user.id}>
                <span>
                  <strong>{user.email}</strong>
                  <small>{user.role === "admin" ? "管理者" : "メンバー"}</small>
                </span>
                <button
                  type="button"
                  disabled={busy || user.id === account.user.id}
                  onClick={() =>
                    void updateUserStatus(
                      user.id,
                      user.status === "active" ? "disabled" : "active",
                    )
                  }
                >
                  {user.status === "active" ? "無効化" : "有効化"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function devicePasskeyName(): string {
  const platform = navigator.platform;
  return platform ? `${platform} のパスキー` : "この端末のパスキー";
}
