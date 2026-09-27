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

## Independent synopses

After migration 0028, the same importer also accepts an optional `synopsis`:

```json
{
  "ja": "確認できた物語の導入を、短く書き直したあらすじ。",
  "en": "A short editorial paraphrase of a verified premise.",
  "sourceUrl": "https://example.org/film",
  "evidence": "Research notes supporting this particular synopsis",
  "reviewedAt": "2026-09-27T02:32:00.000Z"
}
```

At least one language is required; omit or use null for an unavailable language.
JA is limited to 600 characters and EN to 1,600. The film page only displays the
selected language, with its own Synopsis heading and source link. A synopsis is
not inferred from credits or a title match. Retain evidence for the exact film
and adaptation, paraphrase briefly, and avoid major spoilers or copying source
marketing text. Keep the introduction focused on production/genre information
when adding a synopsis so the page does not repeat the plot.

`movie_synopses` stores these separately from `movie_introductions`, with its own
source, evidence and per-film review timestamp. A newer synopsis review replaces
both languages together (null explicitly removes a translation); an older/equal
review is ignored. Omitting `synopsis` preserves existing data. Raw evidence and
review timestamps remain internal; the API returns only `synopsisJa`,
`synopsisEn` and `synopsisSourceUrl`. The initial catalog has 15 bilingual
synopses from retained reviewed sources. New ones require review and import;
page visits and scheduled collection do not trigger additional source requests.
