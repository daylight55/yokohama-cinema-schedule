# Reviewed movie titles and introductions

`evidence` retains the research notes used to identify a film. It is not display copy.
Optional `introduction.ja` / `introduction.en` are short editorial introductions
based on those notes, with no invented plot, marketing claims or major spoilers.
The introduction uses that entry's `sourceUrl`. Additional source checks must be
recorded in `evidence`. Keep both languages together; do not translate an unknown
international title by guesswork.

The 2026-09-26 catalog contains 93 bilingual introductions. `さとこはいつも` and
`あの星が降る丘で、君とまた出会いたい。` are omitted because the retained evidence only
identifies the title and the source could not be read during this review. Other
brief entries intentionally describe only confirmed production/screening facts.

After migration 0026, generate the reviewed import:

```sh
node --experimental-strip-types scripts/reviewed-titles.mjs > /tmp/reviewed-titles.sql
```

Apply the SQL with Wrangler D1 after review (locally first, then remotely).
The optional first argument selects another catalog file. Invalid introductions
fail before any SQL is emitted. An import preserves already verified titles and
their research attempt counts. Introductions and original evidence are stored
separately in `movie_introductions`; the schedule API exposes only the two
introductions and their source URL, not the research notes.

Advance `introductionReviewedAt` when revising the catalog's introductions.
Only a newer review replaces an existing introduction, so replaying an old
catalog cannot undo a newer edit. Leaving an introduction out does not delete an
existing one. Automatic title research does not publish unreviewed descriptions;
new titles gain an introduction after review and import. No external lookup runs
when someone opens a film page.
