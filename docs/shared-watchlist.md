# Shared watchlist planning

The shared watchlist shows only starred films with a future screening in the
current seven-day movie-detail window. Screening availability is checked against
live D1 showings and active, enabled cinemas. Past, removed and out-of-window
screenings do not keep a film in the list. Films return if a new screening is
collected; personal stars and notes are not deleted by this filter.

Mutual **unwatched** interest sorts first. Each member's watched status is explicit
and muted; when all interested members have watched a film it moves into a closed
“Already watched” section. A mixed group remains available for planning. A
“Choose a showtime” link opens the existing film timeline, and “Add to my watchlist”
lets another member join the interest without leaving the shared page.

Starring a film opens its existing preferences sheet with an optional 200-character
note. The label explicitly states that notes are shared with the user's groups.
Notes are owned by the author, shared only with group peers, and edited through
the sheet or shared list. They are per user/film, not a separate discussion thread
per group. A status update does not overwrite the note, and a note update does not
change the star/status. Removing the star stops sharing its note; personal notes
remain available for later reuse. No external messages are sent.

Migration 0032 adds the bounded comment column. Apply pending 0031 (groups) and
0032 before Pages. New UI supports JP/EN and retains the separate management page.

Tests use real SQLite to verify schedule/date/cinema exclusion, watched grouping,
mutual ranking, validation, independent field updates, member scoping and author
ownership. Mobile browser checks cover 320px and 390px, optional note save/edit,
watched disclosure, peer comments, interest joins, and navigation to showtimes.
