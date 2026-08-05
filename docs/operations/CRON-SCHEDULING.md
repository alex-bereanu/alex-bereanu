# Cron Scheduling

## Current Vercel Hobby schedule

`vercel.json` runs both jobs once per day in UTC:

- `GET /api/internal/media-worker?limit=10` at 02:17 UTC processes queued media and reconciles expired uploads.
- `GET /api/internal/operations` at 03:17 UTC runs operational maintenance.

Vercel Hobby may invoke a daily cron at any point during its scheduled hour. Media uploaded after the worker runs can therefore remain queued until the next daily run.

Set `CRON_SECRET` in Vercel to a random value of at least 32 characters. Vercel sends it as `Authorization: Bearer <CRON_SECRET>` to both routes. Never put the secret in this repository or in a scheduler URL.

## Move the media worker to an external scheduler

Use this cutover when media must be processed more frequently than once per day:

1. Configure the external scheduler to send a request every five minutes:

   ```text
   POST https://<production-domain>/api/internal/media-worker?limit=10
   Authorization: Bearer <MEDIA_WORKER_SECRET>
   ```

2. Store a distinct random `MEDIA_WORKER_SECRET` of at least 32 characters in both Vercel and the scheduler's encrypted secret store. Do not reuse `CRON_SECRET`.
3. Trigger the scheduler once and require an HTTP `200` response containing `"ok": true`. Investigate any timeout, `404`, or non-JSON response before enabling the recurring schedule.
4. Remove only the `/api/internal/media-worker?limit=10` entry from `vercel.json`; retain the daily `/api/internal/operations` entry.
5. Redeploy, confirm the media-worker job is absent from Vercel's Cron Jobs page, then enable the external recurring schedule.
6. Confirm new uploads leave the queue and review function logs without recording authorization headers, object keys, filenames, or client content.

To move back to Vercel scheduling, disable the external schedule before restoring the Vercel cron entry so both schedulers cannot invoke the worker concurrently.
