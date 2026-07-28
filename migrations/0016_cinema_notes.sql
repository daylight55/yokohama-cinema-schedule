ALTER TABLE cinema_travel_preferences
ADD COLUMN note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 2000);
