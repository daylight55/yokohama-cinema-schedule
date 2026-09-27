-- Keep editorial introductions and their evidence separate from title research.
CREATE TABLE movie_introductions (
  title_key TEXT PRIMARY KEY REFERENCES movie_title_research(title_key),
  introduction_ja TEXT NOT NULL CHECK (length(introduction_ja) BETWEEN 1 AND 240),
  introduction_en TEXT NOT NULL CHECK (length(introduction_en) BETWEEN 1 AND 600),
  evidence TEXT NOT NULL,
  source_url TEXT NOT NULL,
  reviewed_at TEXT NOT NULL
);
