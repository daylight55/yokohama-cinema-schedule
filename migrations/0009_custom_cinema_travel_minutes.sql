ALTER TABLE cinema_travel_preferences
ADD COLUMN custom_duration_minutes INTEGER
  CHECK (
    custom_duration_minutes IS NULL OR
    custom_duration_minutes BETWEEN 1 AND 1440
  );
