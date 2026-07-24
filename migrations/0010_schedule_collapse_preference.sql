INSERT INTO app_preferences (
  preference_key,
  preference_value,
  updated_at
)
VALUES (
  'schedule_collapse_minutes',
  '60',
  CURRENT_TIMESTAMP
)
ON CONFLICT(preference_key) DO NOTHING;
