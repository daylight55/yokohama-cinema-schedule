import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { BellIcon, CameraIcon, SignOutIcon, UserCircleIcon } from "@phosphor-icons/react";
import type { MemberProfile } from "../shared/member-profile";
import {
  PROFILE_NAME_LIMIT,
  PROFILE_BIO_LIMIT,
} from "../shared/member-profile";
import { localize as t } from "./i18n";
import { AvatarCropper } from "./AvatarCropper";
import { useUnreadNotifications } from "./NotificationContext";
import { hashForAppView } from "./lib";

const ProfileContext = createContext<{
  profile: MemberProfile | null;
  setProfile: (profile: MemberProfile) => void;
  loadError: boolean;
  reload: () => void;
}>({ profile: null, setProfile: () => {}, loadError: false, reload: () => {} });
export function MemberProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoadError(false);
    void fetch("/api/account/profile", { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value = (await response.json()) as MemberProfile;
        if (!abort.signal.aborted) setProfile(value);
      })
      .catch(() => {
        if (!abort.signal.aborted) setLoadError(true);
      });
    return () => abort.abort();
  }, [attempt]);
  return (
    <ProfileContext
      value={{
        profile,
        setProfile,
        loadError,
        reload: () => setAttempt((value) => value + 1),
      }}
    >
      {children}
    </ProfileContext>
  );
}
export function MemberAvatar({
  name,
  url,
  large = false,
}: {
  name: string;
  url?: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span
      className={`member-avatar${large ? " member-avatar-large" : ""}`}
      aria-hidden="true"
    >
      {url && !failed ? (
        <img src={url} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>
          {Array.from(name.trim())[0]?.toLocaleUpperCase() || (
            <UserCircleIcon size={26} />
          )}
        </span>
      )}
    </span>
  );
}
export function ProfileMenu() {
  const unread = useUnreadNotifications();
  const { profile } = useContext(ProfileContext);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => {
      if (details.current) details.current.open = false;
    };
    const outside = (event: PointerEvent) => {
      if (!details.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.current?.open) {
        close();
        details.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("hashchange", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("hashchange", close);
    };
  }, []);
  const close = () => {
    if (details.current) details.current.open = false;
  };
  return (
    <details className="profile-menu" ref={details}>
      <summary
        aria-label={`${t("プロフィールメニュー")}${unread ? ` · ${t("未読")} ${unread}` : ""}`}
        title={t("プロフィールメニュー")}
      >
        <MemberAvatar
          name={profile?.displayName ?? ""}
          url={profile?.avatarUrl}
        />
        {unread > 0 && <span className="profile-unread-badge" aria-hidden="true">{unread}</span>}
      </summary>
      <nav className="profile-menu-panel" aria-label={t("アカウント")}>
        {profile && (
          <strong className="profile-menu-name">{profile.displayName}</strong>
        )}
        <a href="#account" onClick={close}>
          <UserCircleIcon size={20} aria-hidden="true" />
          {t("マイページ")}
        </a>
        <a href="#notifications" onClick={close}>
          <BellIcon size={20} aria-hidden="true" />
          {t("新着情報")}
          {unread > 0 && <span className="menu-unread-badge" aria-label={`${t("未読")} ${unread}`}>{unread}</span>}
        </a>
        <form method="post" action="/auth/logout">
          <button type="submit">
            <SignOutIcon size={20} aria-hidden="true" />
            {t("ログアウト")}
          </button>
        </form>
      </nav>
    </details>
  );
}

export function ProfileEditor() {
  const { profile, setProfile, loadError, reload } = useContext(ProfileContext);
  if (loadError)
    return (
      <div role="alert">
        <p>{t("プロフィールを読み込めませんでした。")}</p>
        <button type="button" onClick={reload}>
          {t("再読み込み")}
        </button>
      </div>
    );
  if (!profile)
    return <p role="status">{t("プロフィールを読み込んでいます…")}</p>;
  return (
    <ProfileForm key={profile.userId} profile={profile} onSaved={setProfile} />
  );
}
function ProfileForm({
  profile,
  onSaved,
}: {
  profile: MemberProfile;
  onSaved: (profile: MemberProfile) => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [cropSource, setCropSource] = useState<File | string | null>(null);
  const photoChoices = useRef<HTMLDialogElement>(null);
  const photoButton = useRef<HTMLButtonElement>(null);
  const currentAvatar = avatar === undefined ? profile.avatarUrl : avatar;
  const processing = cropSource !== null;
  const wasProcessing = useRef(false);
  useEffect(() => {
    if (wasProcessing.current && !processing) photoButton.current?.focus();
    wasProcessing.current = processing;
  }, [processing]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const modified =
    avatar !== undefined || name !== profile.displayName || bio !== profile.bio;
  function choose(file?: File) {
    if (!file) return;
    setError("");
    setSaved(false);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError(t("5MB以下のJPEG・PNG・WebP画像を選んでください。"));
      return;
    }
    setCropSource(file);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name, bio, avatar }),
      });
      if (!response.ok) throw new Error();
      const updated = (await response.json()) as MemberProfile;
      onSaved(updated);
      setName(updated.displayName);
      setBio(updated.bio);
      setAvatar(undefined);
      setSaved(true);
    } catch {
      setError(
        t("プロフィールを保存できませんでした。もう一度お試しください。"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="member-profile-section"
      aria-labelledby="member-profile-title"
    >
      {cropSource && <AvatarCropper source={cropSource} onCancel={() => { setCropSource(null); }} onApply={(data) => { setAvatar(data); setCropSource(null); setSaved(false); }} />}
      <dialog ref={photoChoices} className="avatar-crop-dialog profile-photo-choice" aria-labelledby="profile-photo-choice-title">
        <h2 id="profile-photo-choice-title">{t("写真を変更")}</h2>
        {currentAvatar && <button type="button" className="account-secondary-button" onClick={() => {
          photoChoices.current?.close();
          setError("");
          setCropSource(currentAvatar);
        }}>{t("現在の写真を加工")}</button>}
        <button type="button" className="account-secondary-button" onClick={() => {
          photoChoices.current?.close();
          fileRef.current?.click();
        }}>{t("新しい写真をアップロード")}</button>
        <button type="button" className="account-secondary-button" onClick={() => photoChoices.current?.close()}>{t("キャンセル")}</button>
      </dialog>
      <h2 id="member-profile-title">{t("プロフィール")}</h2>
      <form
        className="member-profile-form"
        onSubmit={(event) => void save(event)}
      >
        <div className="profile-photo-row">
          <MemberAvatar
            name={name}
            url={currentAvatar}
            large
          />
          <div className="profile-photo-actions">
            <input
              ref={fileRef}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              tabIndex={-1}
              aria-label={t("プロフィール画像")}
              disabled={busy || processing}
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy || processing}
              ref={photoButton}
              onClick={() => currentAvatar ? photoChoices.current?.showModal() : fileRef.current?.click()}
            >
              <CameraIcon size={20} aria-hidden="true" />
              {processing ? t("画像を準備中…") : t("写真を変更")}
            </button>
            {currentAvatar && (
              <button
                className="profile-photo-remove"
                type="button"
                disabled={busy || processing}
                onClick={() => {
                  setAvatar(null);
                  setSaved(false);
                }}
              >
                {t("写真を削除")}
              </button>
            )}
          </div>
        </div>
        <label htmlFor="profile-display-name">{t("表示名")}</label>
        <input
          id="profile-display-name"
          name="displayName"
          autoComplete="nickname"
          required
          maxLength={PROFILE_NAME_LIMIT}
          value={name}
          disabled={busy}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
        <label htmlFor="profile-bio">{t("ひとこと")}</label>
        <textarea
          id="profile-bio"
          name="bio"
          rows={2}
          maxLength={PROFILE_BIO_LIMIT}
          value={bio}
          disabled={busy}
          placeholder={t("好きな映画やジャンルなど")}
          onChange={(e) => {
            setBio(e.target.value);
            setSaved(false);
          }}
        />
        <p className="profile-sharing-note">
          {t("プロフィールは共有メンバーに表示されます。")}
        </p>
        <div className="profile-save-row">
          <button
            type="submit"
            disabled={busy || processing || !modified || !name.trim()}
          >
            {busy ? t("保存中…") : t("保存する")}
          </button>
          {saved && <span role="status">{t("保存しました")}</span>}
        </div>
        {error && (
          <p role="alert" className="account-message error">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

export function MemberProfileLink({ userId, name, url }: { userId: string; name: string; url?: string | null }) {
  return <a className="member-profile-link" href={hashForAppView("member", { user: userId })} aria-label={`${name} · ${t("マイページ")}`}>
    <MemberAvatar name={name} url={url} /><span>{name}</span>
  </a>;
}
