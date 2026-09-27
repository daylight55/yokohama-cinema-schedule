import { useState } from "react";
import type { SharingResponse } from "../shared/sharing";
import { localize as t, localeCode } from "./i18n";

export function SharingControls({
  data,
  onSelect,
  onChanged,
}: {
  data: SharingResponse;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const group = data.groups.find((g) => g.id === data.groupId);
  const [mode, setMode] = useState<"new" | "add" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<{
    url: string;
    emailStatus: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const open = (next: typeof mode) => {
    setMode(next);
    setName(group?.name ?? "");
    setEmail("");
    setResult(null);
    setError(false);
    setCopied(false);
  };
  return (
    <section className="sharing-group-controls" aria-label={t("共有グループ")}>
      {data.groups.length > 1 ? (
        <label>
          {t("共有グループ")}
          <select
            value={data.groupId ?? ""}
            onChange={(e) => {
              open(null);
              onSelect(e.target.value);
            }}
          >
            {data.groups.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      ) : group ? (
        <h2>{group.name}</h2>
      ) : (
        <p>{t("まずは一緒に映画を楽しむ相手を招待してね！")}</p>
      )}
      <div className="sharing-group-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={() => open("new")}
        >
          {t("新しい相手を招待")}
        </button>
        {group && (
          <>
            <button
              className="secondary-button"
              type="button"
              onClick={() => open("add")}
            >
              {t("このグループに招待")}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => open("rename")}
            >
              {t("名前を変更")}
            </button>
          </>
        )}
      </div>
      {mode && (
        <form
          className="sharing-group-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(false);
            setResult(null);
            try {
              const response = await fetch(
                mode === "rename" ? "/api/sharing" : "/api/account/invites",
                {
                  method: mode === "rename" ? "PATCH" : "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(
                    mode === "rename"
                      ? { groupId: group?.id, name }
                      : {
                          email,
                          sendEmail,
                          groupId: mode === "add" ? group?.id : null,
                          language: localeCode().startsWith("en") ? "en" : "ja",
                        },
                  ),
                },
              );
              if (!response.ok) throw new Error("request_failed");
              if (mode === "rename") {
                open(null);
                onChanged();
              } else setResult(await response.json());
            } catch {
              setError(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>
            {t(
              mode === "rename"
                ? "名前を変更"
                : mode === "add"
                  ? "このグループに招待"
                  : "新しい相手を招待",
            )}
          </h3>
          {mode === "rename" ? (
            <label>
              {t("グループ名")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </label>
          ) : (
            <>
              <p>
                {t(
                  "招待リンクは1日有効だよ。参加すると予定と気になる作品を共有するよ！",
                )}
              </p>
              <label>
                {t("招待先のメール（省略可）")}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required={sendEmail}
                  autoComplete="email"
                />
              </label>
              <label className="sharing-email-choice">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                />
                {t("メールで送る")}
              </label>
            </>
          )}
          <div className="sharing-group-actions">
            <button
              className="secondary-button"
              type="submit"
              disabled={busy || !!result}
            >
              {t(
                mode === "rename"
                  ? "保存"
                  : sendEmail
                    ? "招待する"
                    : "招待リンクを作成",
              )}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => open(null)}
            >
              {t("キャンセル")}
            </button>
          </div>
          {error && (
            <p role="alert">
              {t("招待・変更に失敗しました。もう一度お試しください。")}
            </p>
          )}
          {result && (
            <div role="status">
              {result.emailStatus !== "not_requested" && (
                <p>
                  {t(
                    result.emailStatus === "sent"
                      ? "招待を送信しました"
                      : "メールを送信できませんでした。リンクを共有してください。",
                  )}
                </p>
              )}
              <label>
                {t("招待リンク")}
                <input
                  readOnly
                  value={result.url}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(result.url)
                    .then(() => setCopied(true))
                    .catch(() => setError(true));
                }}
              >
                {t(copied ? "コピーしました" : "リンクをコピー")}
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
