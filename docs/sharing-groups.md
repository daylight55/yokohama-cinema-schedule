# Invitation-first sharing

`#shared` displays plans and starred films for the selected group. `#groups`
contains invitation issuance, group rename and member lists. A single membership
uses a heading; two or more use a native select. All controls have JP/EN labels.

Any active, registered member can issue a 24-hour, single-use invitation. A fresh
invitation creates a pair when accepted; its default name is `Name & Name`.
Invitations created for an existing group append the recipient there instead.
Existing users accept by signing in with their verified Google identity, just as
new users do. The invitation page discloses plan/watchlist sharing before entry.
Group members can rename the group and invite additional members.

Membership is checked on issuance and again on acceptance. D1's acceptance
trigger creates the group/members in the same transaction as token consumption;
new signup rolls everything back on failure. Email restrictions, expiry,
revocation, inviter status and existing-group membership remain enforced.

The sharing API authorizes the requested group first, then scopes **each** member,
plan and watchlist query to that group. Client-supplied group IDs cannot expand
scope. With no memberships it returns no shared personal data. Ordinary users
can list/revoke only their own invitations; administrators retain their existing
invitation management permissions. There are at most 20 pending live invitations
per issuer in normal sequential use.

Migration 0031 backfills pairs only from accepted signup-invitation history.
It deliberately does not infer friendships between unrelated registered users.
Historical users without retained invitation records can use a new invitation.
User deletion cascades memberships; empty groups are removed. Withdrawal or
admin disabling immediately excludes a member's plans/watchlist from responses.

## Validation

SQLite-backed tests cover pair naming, new signup, existing-user acceptance,
adding a third member, wrong email, replay, self-invite, expiry/revocation,
withdrawn inviter, lost inviter membership, rename authorization and cross-group
isolation. Local mobile verification covers JP/EN, switching, rename, link
issuance, `#groups` direct/reload/back/forward and 320/390px layouts.

Deploy migration 0031 **before** deploying Pages. Deploy the refresh Worker too (account purge counts now exclude cascaded rows).
The mail Worker changes only
copy to describe joining and sharing, and should be deployed with Pages.
