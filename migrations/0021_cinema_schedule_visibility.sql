ALTER TABLE cinema_travel_preferences
ADD COLUMN show_in_schedule INTEGER NOT NULL DEFAULT 1
  CHECK (show_in_schedule IN (0, 1));
