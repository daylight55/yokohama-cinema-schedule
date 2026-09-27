# Android scrolling stability investigation (2026-09-27)

Report: Pixel 9a shuts down or force-closes after repeated horizontal swipes on
Showtimes. Android version, browser/version, and whether this is a device reboot,
System UI restart, or browser-process exit are still unknown. No physical Pixel
is connected; desktop responsive checks cannot establish that the reboot is fixed.

## Observed site-side triggers

A production schedule had 8,803 elements, 293 horizontal regions and 132 time
rows. The previous history listener captured every descendant scroll event and
queried every horizontal region, read its position, queried expanded sections,
and allocated fresh arrays on every frame. A fling in one row therefore repeated
whole-page work. The history cache was already bounded to 80 entries; this was
avoidable transient allocation/layout overhead, not proof of an unbounded leak.

Mobile CSS also stacked blurred sticky header/date/search surfaces and a blurred
floating time control. Cinema/date strips used scroll snapping. These increase
compositing work; we have no device GPU logs proving a driver failure. Swiping a
non-overflowing marked strip could unexpectedly trigger an entire date change.

## Mitigations

- Scroll events update only the document coordinates or the emitting strip's
  position. Stable keys preserve positions when rows reorder. Open sections and
  focus are captured on clicks/toggles; full DOM work happens only on restoration.
- Time-period indicator measurements wait until scroll completion, with a 150ms
  fallback for browsers lacking `scrollend`. Horizontal events do not trigger it.
- Touch/narrow screens use opaque sticky surfaces without backdrop filters and
  free scrolling without snapping. Desktop mouse styling is preserved.
- All marked horizontal regions own their gestures, including when content fits.

## Android evidence and limits

Google's Android 16 **beta** release notes document a System UI crash when
interacting with certain WebView elements (fixed in Beta 2, issue 392011635),
unexpected reboots (Beta 2.1/3), restart with screen magnification (Beta 4, issue
408330740), and Google app crash loading a website (Beta 4.1, issue 415097836).
These are historical fixes, not evidence that stable Android 16 or this Pixel has
the same defect. A Google-app embedded browser/WebView must also be distinguished
from standalone Chrome. No matching confirmed Pixel 9a/Chrome horizontal-swipe
reboot defect was established by the public-source search.

- https://developer.android.com/about/versions/16/release-notes
- https://issuetracker.google.com/issues/392011635
- https://issuetracker.google.com/issues/408330740
- https://issuetracker.google.com/issues/415097836
- https://support.google.com/pixelphone/answer/4582729?hl=en
- https://developer.mozilla.org/en-US/docs/Web/API/Document/scrollend_event

An ordinary page script cannot request device power-off. If the Google boot logo
appears, OS/driver/watchdog/thermal/hardware causes deserve investigation in
addition to page resource pressure. If just the tab/app closes, renderer/GPU
process failure or memory pressure is more plausible. These are hypotheses.
Google recommends checking Android/app updates and available storage for restart
problems. No factory reset, security-setting change, or repeated crash testing is
needed for this mitigation.

## Validation

Regression tests emit 500 horizontal scroll events and assert zero document-wide
queries, while testing keyed horizontal restoration, delayed loading, focus,
section state and navigation without a click. Existing gesture tests cover marked
regions that both overflow and fit. Run `npm run ci:pr`, plus 320x700/390x844
browser checks, repeated horizontal scrolling, date navigation, and back/forward.

For a conclusive device diagnosis collect only Android build/security patch,
browser name/version, crash time and whether the whole device restarts. Redact
account/contact data from any optional Android bug report or Chrome crash log.
