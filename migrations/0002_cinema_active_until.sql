CREATE INDEX IF NOT EXISTS idx_cinemas_active_until
  ON cinemas(active_until);

UPDATE cinemas
SET active_until = '2026-09-30'
WHERE id = 'movil' AND active_until IS NULL;

UPDATE cinemas
SET active_until = '2026-08-31'
WHERE id = 'novecento' AND active_until IS NULL;
