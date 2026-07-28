CREATE VIRTUAL TABLE IF NOT EXISTS showing_search USING fts5(
  showing_id UNINDEXED,
  source_id UNINDEXED,
  schedule_date UNINDEXED,
  search_text,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO showing_search (
  showing_id,
  source_id,
  schedule_date,
  search_text
)
SELECT
  s.id,
  s.source_id,
  date(s.starts_at, '+9 hours'),
  lower(s.title || ' ' || c.name || ' ' || c.short_name)
FROM showings s
JOIN cinemas c ON c.id = s.cinema_id;
