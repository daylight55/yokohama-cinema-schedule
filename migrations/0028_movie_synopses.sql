-- Plot summaries have their own provenance and review cycle, separate from introductions.
CREATE TABLE movie_synopses (
  title_key TEXT PRIMARY KEY REFERENCES movie_title_research(title_key),
  synopsis_ja TEXT CHECK (synopsis_ja IS NULL OR length(synopsis_ja) BETWEEN 1 AND 600),
  synopsis_en TEXT CHECK (synopsis_en IS NULL OR length(synopsis_en) BETWEEN 1 AND 1600),
  evidence TEXT NOT NULL,
  source_url TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  CHECK (synopsis_ja IS NOT NULL OR synopsis_en IS NOT NULL)
);
