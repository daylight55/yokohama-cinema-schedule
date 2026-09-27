ALTER TABLE movie_preferences ADD COLUMN comment TEXT NOT NULL DEFAULT '' CHECK(length(comment) <= 200);
