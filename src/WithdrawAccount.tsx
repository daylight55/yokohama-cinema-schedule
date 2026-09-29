import { useState } from "react";
import { localize as t } from "./i18n";

export function WithdrawAccount() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <details className="account-section account-withdrawal">
      <summary>{t("退会する")}</summary>
      <p>{t("退会するとログアウトし、共有していた予定やプロフィールは表示されなくなります。")}</p>
      <p>{t("データは1か月間保持します。期限前に再ログインすると復帰でき、ログインしないまま期限を過ぎると自動で削除されます。")}</p>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(false);
        try {
          const response = await fetch("/api/account/withdraw", { method: "POST" });
          if (!response.ok) throw new Error();
          window.location.assign("/auth/login?withdrawn=1");
        } catch { setError(true); setBusy(false); }
      }}>
        <label><input type="checkbox" required disabled={busy} /> {t("データの保持期間と削除について確認しました")}</label>
        {error && <p role="alert">{t("退会できませんでした。もう一度お試しください。")}</p>}
        <button type="submit" disabled={busy}>{t(busy ? "処理中…" : "退会してログアウト")}</button>
      </form>
    </details>
  );
}
