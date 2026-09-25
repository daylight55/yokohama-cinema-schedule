import { localeCode, localize } from "./i18n";
import {
  FingerprintIcon,
  GoogleLogoIcon,
  KeyIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { AccountResponse } from "../shared/types";
import { PageHeader, PageShell } from "./PageLayout";

export function AccountPage({
  profileSettings,
}: {
  profileSettings?: ReactNode;
}) {
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
    loadAccount().catch(() => setError("アカウント情報を読み込めませんでした"));
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
      const optionsResponse = await fetch("/api/passkeys/register/options", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!optionsResponse.ok) throw new Error();
      const payload = (await optionsResponse.json()) as {
        options: PublicKeyCredentialCreationOptionsJSON;
        challengeId: string;
      };
      const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(
        payload.options,
      );
      const credential = await navigator.credentials.create({ publicKey });
      if (
        !(credential instanceof PublicKeyCredential) ||
        typeof credential.toJSON !== "function"
      ) {
        throw new Error();
      }
      const verifyResponse = await fetch("/api/passkeys/register/verify", {
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
      });
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
    if (!window.confirm(localize("このパスキーを削除しますか？"))) return;
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

  if (!account) {
    return (
      <PageShell className="account-page" label={localize("マイページ")}>
        <PageHeader eyebrow={localize("設定")} title={localize("マイページ")} />

        {localize(profileSettings)}
        <p className={error ? "account-message error" : "account-muted"}>
          {localize(error ?? "アカウント情報を読み込んでいます…")}
        </p>
      </PageShell>
    );
  }

  const email = account.user.displayEmail ?? account.user.email;
  return (
    <PageShell className="account-page" label={localize("マイページ")}>
      <PageHeader
        eyebrow={localize("設定")}
        title={localize("マイページ")}
        lead={localize(email ?? "管理者用セッション")}
      />

      {localize(profileSettings)}

      {localize(
        account.user.legacy && account.googleConfigured && (
          <section className="account-notice">
            <strong>{localize("Googleアカウントを管理者として登録")}</strong>
            <a href="/auth/google/login/start">
              {localize("Googleアカウントを連携")}
            </a>
          </section>
        ),
      )}

      {localize(
        error && <p className="account-message error">{localize(error)}</p>,
      )}
      {localize(
        message && (
          <p className="account-message success">{localize(message)}</p>
        ),
      )}

      {localize(
        !account.user.legacy && (
          <>
            <section className="account-section">
              <div className="account-section-title account-google-row">
                <GoogleLogoIcon size={23} aria-hidden="true" />
                <div>
                  <h2>{localize("Google")}</h2>
                </div>
                {localize(
                  account.methods.google ? (
                    <strong className="account-method-status">
                      {localize("連携済み")}
                    </strong>
                  ) : account.googleConfigured ? (
                    <a
                      className="account-method-link"
                      href="/auth/google/login/start"
                    >
                      {localize("連携")}
                    </a>
                  ) : (
                    <small className="account-method-status">
                      {localize("設定待ち")}
                    </small>
                  ),
                )}
              </div>
            </section>

            <section className="account-section">
              <div className="account-section-title">
                <KeyIcon size={22} aria-hidden="true" />
                <div>
                  <h2>{localize("パスワード")}</h2>
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
                  {localize("新しいパスワード")}
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
                  {localize("確認")}
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
                  {localize(account.methods.password ? "更新する" : "設定する")}
                </button>
              </form>
            </section>

            <section className="account-section">
              <div className="account-section-title">
                <FingerprintIcon size={24} aria-hidden="true" />
                <div>
                  <h2>{localize("パスキー")}</h2>
                </div>
              </div>
              {localize(
                passkeyAvailable ? (
                  <button
                    className="account-secondary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void registerPasskey()}
                  >
                    {localize("パスキーを追加")}
                  </button>
                ) : (
                  <p className="account-muted">
                    {localize(
                      "この端末またはブラウザではパスキーを利用できません。",
                    )}
                  </p>
                ),
              )}
              {localize(
                account.passkeys.length > 0 && (
                  <ul className="passkey-list">
                    {localize(
                      account.passkeys.map((passkey) => (
                        <li key={passkey.id}>
                          <span>
                            <strong>{localize(passkey.name)}</strong>
                            <small>
                              {localize(
                                new Date(passkey.createdAt).toLocaleDateString(
                                  localeCode(),
                                ),
                              )}
                              {localize("に追加")}
                            </small>
                          </span>
                          <button
                            type="button"
                            aria-label={localize(`${passkey.name}を削除`)}
                            disabled={busy}
                            onClick={() => void deletePasskey(passkey.id)}
                          >
                            <TrashIcon size={18} aria-hidden="true" />
                          </button>
                        </li>
                      )),
                    )}
                  </ul>
                ),
              )}
            </section>
          </>
        ),
      )}
    </PageShell>
  );
}

function devicePasskeyName(): string {
  const platform = navigator.platform;
  return platform ? `${platform} のパスキー` : "この端末のパスキー";
}
