# MaurMaket scheduled jobs

`cron-job.org` is the schedule owner. Each scheduled call POSTs to the Vercel API, where the existing job handler runs against authoritative Supabase. Render does not run duplicate local timers. A per-job database lease prevents overlapping invocations across Vercel instances; it is not an exactly-once guarantee, so job handlers must remain retry-safe.

## One-time setup

1. Deploy the code containing `POST /api/internal/jobs/:name` to the Vercel production project.
2. Generate a unique scheduler secret (at least 32 random characters) and set it as the Vercel production environment variable `JOB_SCHEDULER_SECRET`. Do not reuse `CRONJOB_API_KEY`; that key controls the cron-job.org account.
3. Add `JOB_SCHEDULER_SECRET` to the local ignored `.env` file used by the sync script. Keep both secrets out of source control and logs.
4. Confirm `CRONJOB_API_KEY` is set in `.env`. Set `PRODUCTION_URL` there only if the API's public Vercel origin differs from `https://maurmaket.vercel.app`.
5. Create or synchronize the cron-job.org jobs in the disabled state:

   ```powershell
   npm run ops:sync-cron-jobs
   ```

6. Check the cron-job.org job list: every title beginning `MaurMaket job:` should point at the Vercel `/api/internal/jobs/<name>` route and remain disabled until the Vercel deployment and secret are confirmed.
7. Enable the schedules:

   ```powershell
   npm run ops:sync-cron-jobs -- --enable
   ```

   The sync script matches only its own `MaurMaket job:` titles, so other cron-job.org jobs are left alone. It uses the provider API key only for account management and sends the separate shared secret in `X-MaurMaket-Cron-Secret` on each scheduled request.

## Operation and limits

- Schedules and time zones come from the registry in `src/jobs/index.js`; run the sync script after changing them.
- Daily retention and message-request archival use UTC, matching the prior server cron defaults. Review reminders and NatCash access reminders are retried every five minutes and gated to Haiti local daytime in the handler.
- MonCash reconciliation and refund payout retries are limited to two records per invocation so they fit within Vercel's 60-second function limit. Backlogs drain on later runs.
- cron-job.org is the single scheduler. If it is unavailable, scheduled processing pauses until it resumes; this does not promote Render or another scheduler automatically. Supabase availability is still required for API requests and leases.
- The cron-job.org dashboard provides execution history and failure notices. `JOB_SCHEDULER_SECRET` must be rotated in Vercel and synchronized to the jobs together; keep jobs disabled during rotation.
- Never put the cron-job.org API key in Vercel request headers or in committed files. Restrict its account key by IP only if the provider's allowlist remains compatible with the operator environment used by the sync script.

## Current job names

`natcash-access-reminders`, `temporary-kyc-upload-expiry`, `meetup-checkin-refunds`, `refund-payout-retries`, `stale-moncash-reconciliation`, `stale-offer-notifications`, `daily-data-retention`, `message-offer-expiry`, `stock-reservation-release`, `natcash-session-expiry`, `daily-notification-delivery`, `overdue-cancellation-review`, `stale-message-request-archive`, `expired-business-subscriptions`, and `completed-order-review-reminders`.

## Current cron-job.org IDs

These jobs were created disabled on 2026-10-19:

| Job | Provider ID |
| --- | ---: |
| `natcash-access-reminders` | 8678447 |
| `temporary-kyc-upload-expiry` | 8678449 |
| `meetup-checkin-refunds` | 8678453 |
| `refund-payout-retries` | 8678456 |
| `stale-moncash-reconciliation` | 8678457 |
| `stale-offer-notifications` | 8678459 |
| `daily-data-retention` | 8678461 |
| `message-offer-expiry` | 8678462 |
| `stock-reservation-release` | 8678464 |
| `natcash-session-expiry` | 8678465 |
| `daily-notification-delivery` | 8678466 |
| `overdue-cancellation-review` | 8678468 |
| `stale-message-request-archive` | 8678471 |
| `expired-business-subscriptions` | 8678475 |
| `completed-order-review-reminders` | 8678476 |
