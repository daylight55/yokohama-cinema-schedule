# Group settings and updates

- On Group management, a member can make the selected group their preferred group. It is saved in D1 for that account and used as the default when sharing opens. Explicitly selecting another group does not overwrite the preference.
- Leaving stops sharing with that group. Personal watchlists and viewing plans remain. Rejoining requires another invitation. A departed inviter's outstanding group invitations are revoked permanently, including if the inviter later rejoins. An empty group is removed.
- The bell opens `#notifications`. New stars, watched transitions and nonempty edits to shared notes generate events. No historical events are backfilled. Identical saves generate no event; when a save both stars and marks watched, it generates one watched event.
- Recipients are the other active members at event time. Reading requires active accounts and still-authorized memberships. Departures cascade both authored events and received notifications. Unstarred/hidden preferences stop exposing their old interest events; notes are read from the current preference, never retained as old snapshots.
- Unread state is stored per account with a monotonic event cursor. Mark-all-read stops at the latest event the reader saw, preserving events that arrive concurrently. The feed paginates in batches of 50 and retains 90 days. The existing hourly maintenance Worker removes expired events.

## Browser notifications

Opt-in, per account and device, from the Updates notification settings. Uses a notifications-only service worker with no fetch interception or private response caching. No Web Push or closed-site delivery is implemented. The page checks for new events every minute while visible; opted-in hidden tabs use a two-minute interval, subject to browser throttling. Hidden tabs without opt-in do not poll. Failed requests back off and stop after five failures. A first load does not alert for old events. The operating-system notification contains generic text only and opens the authenticated Updates page. Unsupported/denied browsers retain the in-app feed.

## Reservations

A viewing plan's `reserved_at` is manually set or cleared by its owner through `/api/viewing-plans`. The "Book tickets" link opens the cinema site; "Mark as booked" is a separate explicit action after booking. Link visits never change reservation state automatically. Shared plans show each member's own booked status.

## Validation and deployment

Migration `0033_group_activity.sql` must precede Pages and refresh Worker deployment. `npm run ci:pr` now exercises migrations through Wrangler's actual local D1 importer, in addition to SQLite unit tests; its SQL parser differs for `CASE END` inside triggers.

Browser checks: 320×700 and 390×844, Japanese/English, preferred-group persistence and selection, leave confirmation/cancel, unread/read transitions, full-width note editor, routing and navigation. Actual OS permission/delivery remains dependent on each device; no browser notification permission was enabled on the user's behalf.
