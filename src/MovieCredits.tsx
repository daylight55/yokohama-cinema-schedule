import type { MovieCredits as Credits } from "../shared/movie-credits";
import { creditNames } from "../shared/movie-credits";
import { translate } from "../shared/i18n";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";

export function MovieCredits({
  credits,
  language,
}: {
  credits?: Credits | null;
  language: "ja" | "en";
}) {
  if (!credits) return null;
  const directors = creditNames(credits.directors, language);
  const cast = creditNames(credits.cast, language);
  if (!credits.releaseYear && !directors.length && !cast.length) return null;
  const separator = language === "ja" ? "、" : ", ";
  return (
    <div className="movie-credits">
      <dl>
        {!!directors.length && (
          <div>
            <dt>{translate("監督", language)}</dt>
            <dd>{directors.join(separator)}</dd>
          </div>
        )}
        {!!credits.releaseYear && (
          <div>
            <dt>{translate("初公開年", language)}</dt>
            <dd>{credits.releaseYear}</dd>
          </div>
        )}
        {!!cast.length && (
          <div>
            <dt>{translate("出演", language)}</dt>
            <dd>{cast.join(separator)}</dd>
          </div>
        )}
      </dl>
      <a
        className="movie-source"
        href={credits.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        {translate("クレジット出典", language)} · Wikidata
        <ArrowSquareOutIcon size={14} aria-hidden="true" />
      </a>
    </div>
  );
}
