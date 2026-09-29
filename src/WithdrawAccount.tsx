import { useEffect, useRef, useState } from "react";
import { localize as t } from "./i18n";

export function WithdrawAccount() {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { if (dialog.current?.open) cancel.current?.focus(); }, [step]);

  async function withdraw() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/account/withdraw", { method: "POST" });
      if (!response.ok) throw new Error();
      window.location.assign("/auth/login?withdrawn=1");
    } catch {
      setError(true);
      setBusy(false);
      submitting.current = false;
    }
  }

  return (
    <div className="account-withdrawal">
      <button type="button" className="account-danger-button" onClick={() => {
        setStep(1);
        setError(false);
        dialog.current?.showModal();
        cancel.current?.focus();
      }}>{t("退会する")}</button>
      <dialog ref={dialog} className="account-withdrawal-dialog" aria-labelledby="withdrawal-title"
        aria-describedby="withdrawal-description" onCancel={(event) => { if (busy) event.preventDefault(); }}>
        <h2 id="withdrawal-title">{t(step === 1 ? "退会前の確認" : "退会の最終確認")}</h2>
        <div id="withdrawal-description">
          {step === 1 ? <>
            <p>{t("退会するとログアウトし、共有していた予定やプロフィールは表示されなくなります。")}</p>
            <p>{t("データは1か月間保持します。期限前に再ログインすると復帰でき、ログインしないまま期限を過ぎると自動で削除されます。")}</p>
          </> : <>
            <p>{t("本当に退会しますか？")}</p>
            <p>{t("退会完了のお知らせを登録メールアドレスにお送りします。")}</p>
          </>}
        </div>
        {error && <p role="alert">{t("退会できませんでした。もう一度お試しください。")}</p>}
        <div className="account-withdrawal-actions">
          <button ref={cancel} className="account-secondary-button" type="button" disabled={busy} onClick={() => dialog.current?.close()}>{t("キャンセル")}</button>
          {step === 1
            ? <button type="button" className="account-secondary-button" onClick={() => setStep(2)}>{t("確認して次へ")}</button>
            : <button type="button" className="account-danger-button" disabled={busy} onClick={() => void withdraw()}>{t(busy ? "処理中…" : "退会してログアウト")}</button>}
        </div>
      </dialog>
    </div>
  );
}
