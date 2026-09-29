import {
  isCompleteTitleTranslation,
  isEnglishMovieTitle,
} from "../../shared/movie-title-language";
import type { MovieTitleRecord } from "../../shared/types";

/** One display policy for schedules, shared watchlists and notifications. */
export async function listMovieTitles(
  db: D1Database,
): Promise<MovieTitleRecord[]> {
  const rows = await db
    .prepare(
      `SELECT r.title_key AS titleKey, r.japanese_title AS japaneseTitle,
    r.original_title AS originalTitle, r.english_title AS englishTitle,
    r.source_url AS sourceUrl, r.source_kind AS sourceKind, r.status,
    t.english_title AS translatedTitle, t.status AS translationStatus,
    i.introduction_ja AS introductionJa, i.introduction_en AS introductionEn,
    i.source_url AS introductionSourceUrl,
    s.synopsis_ja AS synopsisJa, s.synopsis_en AS synopsisEn, s.source_url AS synopsisSourceUrl,
    c.credits_json AS creditsJson
    FROM movie_title_research r
    LEFT JOIN movie_title_translations t ON t.title_key=r.title_key
    LEFT JOIN movie_introductions i ON i.title_key=r.title_key
    LEFT JOIN movie_synopses s ON s.title_key=r.title_key
    LEFT JOIN movie_credits c ON c.title_key=r.title_key AND c.status='verified'`,
    )
    .all<
      MovieTitleRecord & {
        status: string;
        translatedTitle: string | null;
        translationStatus: string | null;
        creditsJson: string | null;
      }
    >();
  return rows.results.map(
    ({ status, translatedTitle, translationStatus, creditsJson, ...row }) => {
      const verified =
        status === "verified" && isEnglishMovieTitle(row.englishTitle);
      return {
        ...row,
        englishTitle: verified
          ? row.englishTitle
          : translationStatus === "translated" &&
              isCompleteTitleTranslation(row.japaneseTitle, translatedTitle)
            ? translatedTitle
            : null,
        sourceKind: verified ? row.sourceKind : "machine_translation",
        sourceUrl: verified ? row.sourceUrl : null,
        originalTitle: verified ? row.originalTitle : null,
        credits: creditsJson ? JSON.parse(creditsJson) : null,
      };
    },
  );
}
