import { useState } from "react";
import {
  sharedWatchlistSections,
  type SharedMovie,
  type SharingResponse,
} from "../shared/sharing";
import { moviePreferenceKey, safeImageUrl } from "../shared/movie";
import { hashForAppView } from "./lib";
import { localize as t, movieTitle } from "./i18n";
import { MemberAvatar } from "./MemberProfile";
import { WatchlistNote } from "./WatchlistNote";

export function SharedWatchlist({
  data,
  member,
  onChanged,
  autoEditKey,
}: {
  data: SharingResponse;
  member: string;
  onChanged: (key: string) => void;
  autoEditKey?: string;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const sections = sharedWatchlistSections(data.movies, member);
  const members = new Map(data.members.map((m) => [m.userId, m]));
  function renderMovie([key, rows]: [string, SharedMovie[]], archived = false) {
    const movie = rows[0];
    const image = safeImageUrl(
      rows.find((m) => safeImageUrl(m.imageUrl))?.imageUrl,
    );
    const active = rows.filter((m) => m.status !== "watched");
    const own = data.movies.find(
      (m) => m.userId === data.userId && moviePreferenceKey(m.title) === key,
    );
    return (
      <li key={key} className={archived ? "shared-movie-watched" : ""}>
        <div className="shared-watchlist-content">
          <div className="shared-film-heading">
            <div>
              {active.length > 1 && (
                <span className="shared-mutual">
                  {t("共通の気になる")} · {active.length}
                </span>
              )}
              <a
                className="shared-film-title"
                href={hashForAppView("movie", { movie: key })}
              >
                {movieTitle(movie.title)}
              </a>
            </div>
            {image && (
              <a
                className="shared-watchlist-art"
                href={hashForAppView("movie", { movie: key })}
                aria-label={movieTitle(movie.title)}
              >
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.hidden = true;
                  }}
                />
              </a>
            )}
          </div>
          <ul className="shared-interest-notes" aria-label={t("気になる理由")}>
            {rows.map((m) => (
              <li
                key={m.userId}
                className={m.status === "watched" ? "member-watched" : ""}
              >
                <div className="shared-interest-person">
                  <MemberAvatar
                    name={members.get(m.userId)?.name ?? ""}
                    url={members.get(m.userId)?.avatarUrl}
                  />
                  <span>{members.get(m.userId)?.name}</span>
                  {m.status === "watched" && (
                    <span className="watched-label">{t("鑑賞済み")}</span>
                  )}
                </div>
                {(m.userId === data.userId
                  ? (notes[key] ?? m.comment)
                  : m.comment) && (
                  <p>
                    {m.userId === data.userId
                      ? (notes[key] ?? m.comment)
                      : m.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {!archived && (
            <a
              className="shared-showtime-link"
              href={hashForAppView("movie", { movie: key })}
            >
              {t("上映時間を選ぶ")} →
            </a>
          )}
          {own ? (
            <details
              className="shared-note-editor"
              open={autoEditKey === key || undefined}
            >
              <summary>{t("ひとことを編集")}</summary>
              <WatchlistNote
                title={movie.title}
                initialValue={notes[key] ?? own.comment ?? ""}
                onSaved={(comment) =>
                  setNotes((current) => ({ ...current, [key]: comment }))
                }
              />
            </details>
          ) : (
            !archived && (
              <button
                className="secondary-button"
                disabled={!!adding}
                onClick={async () => {
                  setAdding(key);
                  setFailed(false);
                  try {
                    const response = await fetch("/api/preferences", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        title: movie.title,
                        imageUrl: movie.imageUrl,
                        starred: true,
                      }),
                    });
                    if (!response.ok) throw new Error("failed");
                    onChanged(key);
                  } catch {
                    setFailed(true);
                  } finally {
                    setAdding(null);
                  }
                }}
              >
                {t("私も気になる")}
              </button>
            )
          )}
        </div>
      </li>
    );
  }
  return (
    <>
      {failed && (
        <p role="alert">
          {t("保存できませんでした。もう一度お試しください。")}
        </p>
      )}
      {!sections.planning.length && (
        <div className="shared-empty">
          <p>{t("今後の上映がある気になる作品はありません。")}</p>
          <a href={hashForAppView("movies")}>{t("上映作品")}</a>
        </div>
      )}
      <ul className="shared-movies">
        {sections.planning.map((entry) => renderMovie(entry))}
      </ul>
      {!!sections.watched.length && (
        <details className="shared-watched-section">
          <summary>
            {t("鑑賞済みの作品")} ({sections.watched.length})
          </summary>
          <ul className="shared-movies">
            {sections.watched.map((entry) => renderMovie(entry, true))}
          </ul>
        </details>
      )}
    </>
  );
}
