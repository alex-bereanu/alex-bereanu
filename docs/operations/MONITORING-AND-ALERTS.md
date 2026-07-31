# Monitoring and Alerts

## Data boundary

The application webhook emits only route templates, error class/digest, CSP directive and blocked origin, sampled Web Vitals, and aggregate queue/maintenance counts. Monitoring must not ingest request bodies, form fields, cookies, authorization headers, share capabilities, signed URLs, raw object keys, filenames, email addresses, telephone numbers, or image content.

Configure `OBSERVABILITY_WEBHOOK_URL`, a distinct `OBSERVABILITY_WEBHOOK_SECRET`, and `WEB_VITALS_SAMPLE_RATE` (recommended `0.1`). The receiving provider must authenticate the bearer secret, enforce TLS, restrict access, and use the log retention in the retention policy.

## Availability checks

- Poll `GET /api/health` every minute for public liveness.
- Poll `GET /api/health?deep=1` with `Authorization: Bearer HEALTH_CHECK_SECRET` every five minutes.
- Alert immediately on two consecutive deep-check failures or database failure.
- Treat `degraded` as actionable: any failed media job or more than 25 pending deletion jobs returns HTTP 503.
- Run `node scripts/verify-deployment.mjs https://production.example` after every deployment and weekly.

## Security alerts

- Admin login/OAuth failures or denials: alert on a sustained increase by keyed IP/actor hash.
- Gallery password failures: alert on distributed/high-volume activity and repeated attempts across capabilities.
- Turnstile action/hostname mismatch: high priority because it can indicate widget misuse or integration drift.
- CSP violations: group by directive and blocked origin; alert on new script/frame/connect origins.
- Private download denial spikes, share revocations, and admin-session revocations: dashboard and investigate anomalies.
- Dependency policy: fail CI on every unaccepted high/critical runtime advisory or expired exception.

## Media and deletion alerts

- `FAILED` media processing jobs: alert immediately; require retry or documented rejection.
- Pending storage deletion jobs: alert when nonzero after the daily job and escalate any item older than 24 hours.
- Expired upload reconciliation failures or abandoned multipart uploads: alert after one daily cycle.
- Scanner unavailable, checksum/metadata mismatch, pixel bomb, malformed image, or archive rejection: count by safe error code only.

## Real-user performance

Aggregate by route group and device/network class. Alert when a representative seven-day p75 exceeds LCP 2.5s, INP 200ms, or CLS 0.1, and when public warm TTFB exceeds 500ms. Do not alert on one sample; require a minimum sample population and compare deployment/version cohorts. The CI Lighthouse gate uses the committed `lighthouserc.json`; RUM remains authoritative for field performance.

## Response ownership

Every alert needs severity, named owner, acknowledgement target, escalation contact, runbook link, and closure evidence. Review alert noise monthly. A disabled webhook, missing scheduled job, or stale health monitor is itself an alert condition.

