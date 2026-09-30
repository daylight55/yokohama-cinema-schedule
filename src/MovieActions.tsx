import { CheckCircleIcon, DotsThreeIcon, StarIcon } from "@phosphor-icons/react";
import type { MouseEventHandler } from "react";
import type { MoviePreferenceStatus } from "../shared/types";
import { localize } from "./i18n";

export function MovieActions({ title, status, starred, saving, className = "", onMore, onStatus, onStar }: {
  title: string;
  status: MoviePreferenceStatus | null;
  starred: boolean;
  saving: boolean;
  className?: string;
  onMore: MouseEventHandler<HTMLButtonElement>;
  onStatus: (status: MoviePreferenceStatus, button: HTMLButtonElement) => void;
  onStar: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <div className={`movie-actions ${className}`} role="group" aria-label={`${localize("作品の操作")} · ${title}`}>
      <button type="button" className="movie-options-button" aria-haspopup="dialog"
        aria-label={`${localize("その他")} · ${title}`} title={localize("その他")} onClick={onMore}>
        <DotsThreeIcon size={22} aria-hidden="true" />
      </button>
      <button type="button" className={`movie-status-button movie-watched-button${status === "watched" ? " active" : ""}`}
        aria-label={`${localize("鑑賞済み")} · ${title}`} title={localize("鑑賞済み")}
        aria-pressed={status === "watched"} disabled={saving}
        onClick={event => onStatus("watched", event.currentTarget)}>
        <CheckCircleIcon size={22} weight={status === "watched" ? "fill" : "regular"} aria-hidden="true" />
      </button>
      <MovieStarButton title={title} starred={starred} saving={saving} onClick={onStar} />
    </div>
  );
}

export function MovieStarButton({ title, starred, saving, onClick, compact = false }: {
  title: string;
  starred: boolean;
  saving: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  compact?: boolean;
}) {
  const label = localize(`${title}を${starred ? "スターから外す" : "スターする"}`);
  return (
    <button type="button" className={`favorite-button${compact ? " compact" : ""}${starred ? " starred" : ""}`}
      aria-label={label} title={label} aria-pressed={starred} disabled={saving} onClick={onClick}>
      <StarIcon size={22} weight={starred ? "fill" : "regular"} aria-hidden="true" />
    </button>
  );
}
