import { CheckCircleIcon, DotsThreeIcon, ProhibitIcon, StarIcon } from "@phosphor-icons/react";
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
        aria-label={`${localize("その他")} · ${title}`} onClick={onMore}>
        <DotsThreeIcon size={22} aria-hidden="true" />
        <span>{localize("その他")}</span>
      </button>
      <button type="button" className={`movie-status-button movie-not-interested-button${status === "not_interested" ? " active" : ""}`}
        aria-pressed={status === "not_interested"} disabled={saving}
        onClick={event => onStatus("not_interested", event.currentTarget)}>
        <ProhibitIcon size={20} aria-hidden="true" />
        <span>{localize("興味なし")}</span>
      </button>
      <button type="button" className={`movie-status-button movie-watched-button${status === "watched" ? " active" : ""}`}
        aria-pressed={status === "watched"} disabled={saving}
        onClick={event => onStatus("watched", event.currentTarget)}>
        <CheckCircleIcon size={20} aria-hidden="true" />
        <span>{localize("鑑賞済み")}</span>
      </button>
      <button type="button" className={`favorite-button${starred ? " starred" : ""}`}
        aria-label={localize(`${title}を${starred ? "スターから外す" : "スターする"}`)}
        aria-pressed={starred} disabled={saving} onClick={onStar}>
        <StarIcon size={22} weight={starred ? "fill" : "regular"} aria-hidden="true" />
      </button>
    </div>
  );
}
