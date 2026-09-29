import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { MovieTitleRecord } from "../shared/types";
import type { Language } from "../shared/language";

export function MovieSynopsis({ movie, language }: { movie?: MovieTitleRecord; language: Language }) {
  const text = language === "en" ? movie?.synopsisEn : movie?.synopsisJa;
  if (!text) return null;
  return (
    <section className="movie-synopsis" aria-labelledby="movie-synopsis-title">
      <h2 id="movie-synopsis-title">{language === "en" ? "Synopsis" : "あらすじ"}</h2>
      <p>{text}</p>
      {movie?.synopsisSourceUrl && (
        <a className="movie-source" href={movie.synopsisSourceUrl} target="_blank" rel="noreferrer">
          {language === "en" ? "Synopsis source" : "あらすじの出典"}
          <ArrowSquareOutIcon size={14} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}
