# Frontend performance measurement

The preceding scroll fix eliminates full-document scans per horizontal scroll
(500-event regression test). This change reuses Intl formatters in localized
time/date displays, JST grouping and movie time strips, and prevents the
30-second clock from rerendering the app while the document is hidden.

## Repeatable comparison

Run `npm run perf:benchmark` (Node 22 or newer). It compares identical 2,000-item
time outputs across five runs, reporting medians and formatter allocations.
An observed local Node 26 run reduced median formatting time from 62.29ms to
1.21ms; allocations dropped from 2,000 to 1. This is a formatter microbenchmark,
not a browser loading, frame rate, energy-use or Pixel shutdown measurement.

`npm run test:performance` checks constant formatter construction across 2,000
time displays, correct locale changes, fixed-size diagnostic storage after
100,000 entries, and the existing 500-horizontal-scroll-event budget. These tests
also run in `npm run ci:pr`; they use operation counts rather than flaky timing
thresholds.

## On-device measurement

Open `https://hama-movie.daylight55.dev/?perf=1#schedule`. Choose **Measure
performance**, perform the same horizontal swipes/date navigation, then choose
**Stop & report**. Repeat with the same date, data, viewport and device for fair
comparisons. Capture after first-page loading has settled to isolate scrolling.

The opt-in panel reports:

- Long tasks: count, total and max duration (ms).
- Long animation frames: count and max duration (ms).
- Event Timing entries >=16ms: count and max duration (not an INP calculation).
- App commits (not every descendant render), DOM element count at stop.
- JS heap bytes when available; otherwise `null`.
- Supported entry types, so unsupported metrics are not mistaken for measured zero.

No frame loop, timer, retained event log, title data or network telemetry is added.
The panel loads only with `?perf=1`; observers run only between Start and Stop and
are disconnected on unmount. DOM size is read only at stop. Metrics are local to
the tab. JS heap does not measure GPU or total process memory.

## Limits

No physical Pixel 9a was available. A browser trace cannot establish why an
entire phone powers off, especially on low battery; OS/driver/thermal/battery
behavior remains a separate investigation. Avoid interpreting a desktop result
as proof that the device restart is fixed. Earlier Android beta issue references
are in `android-scroll-stability.md` and are not confirmed matches for this phone.

## Browser smoke result

A local production build in the desktop in-app browser, at 320×700, rendered
9,347 DOM elements from a 356-screening local fixture. Ten horizontal scroll
actions during a 998ms capture recorded zero long tasks, zero long animation
frames and zero App commits. Event Timing max was 56ms; reported JS heap was
24,398,846 bytes. This short desktop automation check validates instrumentation
and the absence of scroll-driven React commits; it is not Pixel/battery evidence.
