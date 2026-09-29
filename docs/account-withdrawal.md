# Account withdrawal

My account ends with a red Close account button. It opens the existing retention notice, then a separate final confirmation. Neither opening the dialog nor confirming the notice submits the request. Cancellation and Escape leave the account unchanged. The final action disables controls until it succeeds or shows an error.

`POST /api/account/withdraw` still requires a same-origin, non-legacy, registered session. D1 atomically queues a completion email, disables the account, revokes sessions/challenges and cancels outstanding invitations. Data remains recoverable for one calendar month; automatic deletion also removes the notification rows.

The private mail Worker gets the recipient and language from D1, never from the browser. It sends the thank-you and completion message with the exact retention deadline in Japan time. Pages requests immediate delivery through its existing service binding; the mail Worker's five-minute cron also drains pending messages. A five-minute lease excludes concurrent requests; failed attempts back off up to one hour. Messages stay eligible until delivery or account-data deletion. Logs use `withdrawal_email_accepted` and `withdrawal_email_failed` without recipient addresses.

Provider acceptance is not inbox delivery. Delivery is at least once: a process crash after provider acceptance but before recording success can cause a duplicate. Normal concurrent delivery and already-recorded successful messages are deduplicated.

Deploy migration 0037 before the new Pages code and mail Worker. The mail Worker now needs the existing D1 database and a five-minute cron, while remaining private (`workers_dev: false`, no public routes). Deploy the mail Worker before Pages so immediate requests have a compatible endpoint. No refresh Worker change is needed.

Validation uses fixture accounts and a mocked email binding; do not withdraw a real account to test this flow. Monitor pending messages with aggregate counts only:

```sql
SELECT count(*) AS pending, min(created_at) AS oldest_pending
FROM account_withdrawal_emails WHERE sent_at IS NULL;
```
