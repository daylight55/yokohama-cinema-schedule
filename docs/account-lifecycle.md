# Account withdrawal

A registered member can close their own account from My page after acknowledging
the retention policy. The same-origin POST `/api/account/withdraw` derives the ID
from the authenticated session, rejects legacy fallback/public mode, and disables
the user, records `withdrawn_at`/`delete_after`, revokes every session and pending
registration challenge, and revokes unused invitations issued by that user in a
single D1 batch. Shared data and avatar endpoints already exclude disabled users.

The deadline is one calendar month in Japan after withdrawal, at the same local
time, clamped to the last day of a shorter month. It is not a rolling inactivity
period for active members. A successful password, Google or passkey login before
that deadline atomically clears withdrawal fields, restores active status and
creates a fresh session. Invalid credentials, existing cookies, and administrator
fallback login do not restore accounts. A normal administrator suspension cannot
be undone by logging in. Administrator status changes cannot override withdrawal.

The refresh Worker's separate hourly cron `37 * * * *` deletes up to 100 expired
withdrawals without collecting schedules or calling AI. The DELETE rechecks the
status and deadline inside D1, so a stale selected ID cannot delete a restored
account. The boundary itself is exclusive: authentication is denied at/after the
deadline even if cleanup has not run yet. Normal physical cleanup latency is less
than one hour (a larger backlog drains in bounded hourly batches).

User foreign-key cascades delete profiles/avatar, encrypted departure information,
preferences, viewing plans, marathon plans, Google token storage, passwords,
passkeys, identities and sessions. Migration 0029 adds a delete trigger for both
incoming/outgoing invitation records that otherwise prevent deletion or retain
email addresses. Deleting local Google calendar connection data does not delete
past events already exported to the user's external calendar.

Watch structured `expired_accounts_deleted` Worker logs (count only). Query
`users WHERE withdrawn_at IS NOT NULL` for pending cleanup. No endpoint permits
manual bulk deletion or deadline bypass. Ordinary disabled users are never purged.
