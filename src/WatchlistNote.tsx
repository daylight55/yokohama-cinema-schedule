import { useState } from "react";
import { localize as t } from "./i18n";

export function WatchlistNote({
  title,
  initialValue,
  onSaved,
}: {
  title: string;
  initialValue: string;
  onSaved: (comment: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);
  return (
    <form
      action="/api/preferences"
      method="post"
      className="watchlist-note"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setStatus(null);
        try {
          const response = await fetch("/api/preferences", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title, comment: value }),
          });
          if (!response.ok) throw new Error("save_failed");
          const saved = (await response.json()) as { comment: string };
          setValue(saved.comment);
          onSaved(saved.comment);
          setStatus("saved");
        } catch {
          setStatus("error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {t("グループに共有するひとこと（任意）")}
        <textarea
          name="comment"
          value={value}
          maxLength={200}
          rows={3}
          placeholder={t("どんなところが気になる？")}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus(null);
          }}
        />
      </label>
      <button className="secondary-button" type="submit" disabled={busy}>
        {t(busy ? "保存中…" : "ひとことを保存")}
      </button>
      {status && (
        <p role="status">
          {t(
            status === "saved"
              ? "ひとことを保存しました"
              : "保存できませんでした。もう一度お試しください。",
          )}
        </p>
      )}
    </form>
  );
}
