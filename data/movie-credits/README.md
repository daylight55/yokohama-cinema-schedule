# Wikidata film credits

The checkpoint records the Wikidata API result and lookup state for reviewed
titles. Names and years are structured API values, never model-generated text.

- P57: directors. P161: cast, or P725 (voice actors) when no P161 cast is listed.
- P1545 billing positions are used when supplied; otherwise source order is kept.
  Up to six people are retained per field. The UI says **Cast**, not **Starring**.
- P577: earliest known Gregorian publication/release year, at year precision or
  better. This is labelled **First released**, not production year. P571
  (inception) is deliberately not treated as a production year.
- Human names use Japanese/English labels and multilingual labels (`mul`) for
  shared international spellings. An English view omits Japanese-only names.
- Reviewed Wikipedia URLs resolve to an exact Wikidata sitelink. Existing
  Wikidata entity IDs are used directly. Other sources require an unambiguous
  film result matching both reviewed Japanese and English names. The lookup
  never fetches arbitrary source URLs or accepts a similarly named book/series.

## Bounded collection

After migration 0027, the existing Worker cron's first cinema batch also enriches
up to three titles. Each title has at most five lifetime attempts, spaced at least
24 hours apart. An atomic claim protects overlapping runs. Any upstream failure
ends that run; confirmed records are not repeatedly fetched. Movie page loads
only read D1 and never trigger API traffic.

For an initial, reviewable import, run sequentially:

```sh
node --experimental-strip-types scripts/movie-credits.mjs collect data/movie-credits/2026-09-27.json 10
node --experimental-strip-types scripts/movie-credits.mjs sql data/movie-credits/2026-09-27.json > /tmp/movie-credits.sql
```

`collect` checkpoints each attempt before accessing the network. It respects the
daily leases and five-attempt cap on subsequent runs, pauses between films, and
stops the entire batch on errors (including 403/429). Do not restart a failed
batch repeatedly to work around access limits. `sql` includes unresolved lookup
state so importing cannot silently reset that limit. Import the reviewed-title
catalog first, then apply credit SQL locally before applying it to remote D1.
Existing verified or newer D1 records are preserved.

The initial checkpoint contains nine verified film lookups. Collection stopped
after an access-limit response; other films remain available for later bounded
cron enrichment. Missing fields are hidden in the UI.
