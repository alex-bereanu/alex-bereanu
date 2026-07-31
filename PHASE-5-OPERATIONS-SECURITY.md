# Phase 5 Operational Security and Ongoing Performance

**Project:** Alex Bereanu Photography  
**Implementation date:** 31 July 2026  
**Repository:** `E:\github\alex-bereanu`  
**Local implementation status:** Complete  
**Production rollout status:** Blocked on migrations, production configuration, provider policies, staging tests, and external penetration test  
**Production database/storage mutation:** Not performed

## User prompts

> look at the the current website implementation and create a plan on how we can continue to develop it into a better version. Focus on improving image loading and overall performance of the website. UI looks good for now, but also take into consideration mobile functionality and performance. Security must also be key, as it will hold valuable personal photos. Before starting to implement the plan, let me review it and we can decide on the best approach. Consider all the relevant skills that you might need in developing the plan

> output all audit as a markdown file and make sure to include my prompt

> sounds good, let's implement Phase 1, including the security verification checkpoint before beginning the image pipeline migration

> looks good, continue with the rest of migration

> continue with phase 3

> continue with phase 4

> great, continue with phase 5

## Executive result

Phase 5 is implemented in the local worktree. Abuse controls are now database-backed across application instances, trusted client identity no longer accepts generic forwarding headers, Turnstile validates route-specific actions and deployment hostnames, and security-sensitive events are stored with keyed hashes rather than raw identities.

The site now has a deployed-header verification path, authenticated deep readiness, privacy-minimized server-error/CSP/Web-Vitals delivery, daily operational reconciliation, configurable retention, dependency-exception enforcement, CI quality/security gates, and explicit backup, restore, incident, storage, monitoring, and penetration-test procedures.

No production migration, retention job, deletion reconciliation, provider policy change, R2 operation, backup, or external test was executed. Phase 5 code is complete locally; the release gate remains intentionally open until the external and production-only checkpoints pass.

## Guidance and sources applied

- Installed Next.js 16.2.12 documentation was read for Proxy placement, CSP tradeoffs, instrumentation, route handlers, Web Vitals, and production behavior.
- Next.js best-practice guidance kept observability isolated and avoided converting cached public pages to per-request rendering solely to support CSP nonces.
- React/Vercel performance guidance kept the Web Vitals client boundary small and omits it entirely when no monitoring webhook is configured.
- The in-app browser and a local production server verified rendered behavior; HTTP response inspection verified the actual headers.
- Vercel documents `x-vercel-forwarded-for` as its platform forwarding header and notes that generic `x-forwarded-for` can be overwritten when another proxy is present: <https://vercel.com/docs/headers/request-headers>.
- Cloudflare recommends validating both Turnstile action and hostname in the Siteverify response: <https://developers.cloudflare.com/turnstile/get-started/server-side-validation/>.

## Critical runtime correction

The production runtime check exposed that the existing root-level `proxy.ts` was not registered because this application places `app` inside `src`. Although the security code compiled, Next's middleware manifest was empty and static responses did not receive its headers.

The file now lives at `src/proxy.ts`, at the same level as `src/app`, as required by the installed Next.js convention. The production build now explicitly lists `ƒ Proxy (Middleware)`, and a fresh runtime request receives the configured CSP and security headers. Phase 1 and Phase 5 regression scripts now read the active source location.

This was a verification finding, not a production change. Whether an existing deployment used the inactive root file must be checked during deployment verification.

## Distributed rate limiting and trusted client IP

- `RateLimitBucket` is now a Prisma model created by the Phase 5 migration; request handlers no longer attempt runtime DDL.
- PostgreSQL performs the counter/reset update atomically, so separate application instances share one limit.
- Rate-limit database keys contain an HMAC identity derived with `RATE_LIMIT_SECRET`, not a raw IP address.
- On Vercel, only `x-vercel-forwarded-for` is accepted and its first value must parse as an IPv4 or IPv6 address.
- Generic `x-forwarded-for` is never trusted. Non-Vercel production requests become the conservative `unknown` identity unless a separately reviewed trusted-proxy implementation is added.
- Development can use a validated `x-real-ip` value for local testing.
- If the distributed store is absent or fails in production, protected routes fail closed with a retry response; they do not fall back to per-instance memory.
- Memory fallback remains development-only.

The database migration must be applied before enabling production traffic, otherwise protected endpoints will correctly remain unavailable.

## Turnstile binding

- Each widget declares one action: `admin_login`, `admin_setup`, `contact`, `booking`, or `gallery_unlock`.
- Siteverify must return the exact expected action.
- Siteverify must return a hostname in `TURNSTILE_EXPECTED_HOSTNAMES`.
- Production refuses Turnstile-protected work when the allowed-hostname policy is absent.
- Tokens longer than 2,048 characters are rejected.
- Verification uses a ten-second timeout and idempotency UUID.
- Failures create a privacy-minimized security audit event with the action and safe reason code.
- The provider secret remains server-only.

## Security audit events

`SecurityAuditEvent` records a deliberately small event vocabulary:

- Admin password login success/failure/rate denial.
- Google OAuth cancellation, state/profile failure, unauthorized account, success, and server error.
- Admin setup denial/success and logout.
- Gallery unlock rate denial, invalid capability, expiry, password failure, and success.
- Share-link creation and revocation.
- Turnstile denials.
- CSP violations.

Raw IPs and actor identities are HMACed with `AUDIT_LOG_SECRET`. Metadata keys/values are bounded and allow only scalar safe values. Passwords, access tokens, cookies, signed URLs, storage keys, request bodies, filenames, email contents, and photo data are not accepted. Audit persistence failure logs only the event type and error class.

## CSP and response-header hardening

Production CSP now includes:

- Exact self, Cloudflare challenge, configured public asset, and configured R2 API origins.
- No broad `https:` source.
- No production `'unsafe-eval'`; development retains it because the installed Next.js documentation requires it for debugging.
- `script-src-attr 'none'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, and `form-action 'self'`.
- Explicit image, font, frame, media, worker, manifest, style-element, and style-attribute policies.
- `upgrade-insecure-requests` in production.
- A same-origin CSP report endpoint that stores only the violated directive and blocked origin.

`'unsafe-inline'` remains in script/style policy because the application retains static/ISR rendering. Per-request nonces would disable static optimization and CDN caching across these routes; experimental SRI was not introduced as a release dependency. This is a documented limitation for future review, not a broad-origin or `unsafe-eval` exception.

Other production headers now include HSTS, nosniff, frame denial, permissions policy, referrer policy, opener/resource policy, origin isolation, and no framework-powered header. Admin/private responses also receive no-store, no-cache, noindex/noarchive, no-referrer, and `Vary: Cookie`.

## Health, reconciliation, and retention

- Public `GET /api/health` exposes only `{ "status": "ok" }` for liveness.
- `GET /api/health?deep=1` requires `HEALTH_CHECK_SECRET` and checks database access, Phase 5 tables, failed media jobs, and pending storage deletions.
- The authenticated `/api/internal/operations` route runs daily through the cron credential.
- Daily work reconciles expired upload sessions, aborts abandoned multipart uploads, retries pending object deletions, and prunes expired operational records.
- Audit events default to 365 days; completed processing/deletion jobs to 90 days; revoked/expired admin sessions to 30 days; expired rate buckets to one day after reset.
- Email-log and ticket deletion are driven by explicit environment values. Ticket cleanup remains disabled until `TICKET_RETENTION_DAYS` is approved and configured.
- Client photos, derivatives, and archives are never age-deleted by the operational maintenance task. Their deletion remains an explicit authenticated action through the durable deletion outbox.
- Aggregate maintenance results are delivered to the monitoring webhook without object keys or personal content.

## Observability and performance budgets

- Next's `onRequestError` instrumentation emits only error class/digest, route template, router, and route type.
- CSP reports emit only directive and blocked origin.
- A small `useReportWebVitals` boundary samples CLS, FCP, FID, INP, LCP, and TTFB only when monitoring is configured.
- Private gallery tokens and public gallery slugs are replaced with route groups before metrics leave the browser.
- Telemetry endpoints validate payload size/schema and are rate limited.
- `performance-budgets.json` defines the approved mobile LCP/INP/CLS, initial-image/payload, TTFB, and Lighthouse score budgets.
- `lighthouserc.json` enforces three-run deployed checks. The deployment workflow audits production or staging weekly when `AUDIT_BASE_URL` is configured.
- Monitoring and alert thresholds are defined in `docs/operations/MONITORING-AND-ALERTS.md`.

The receiving provider must aggregate representative samples for p75 alerting; this repository cannot provide a real field population locally.

## Dependency policy and CI

- Pull requests, main-branch pushes, weekly schedules, and manual runs execute install, Prisma generation, lint, typecheck, all Phase 1–5 regression checks, production build, and runtime dependency policy.
- Dependabot checks npm weekly and GitHub Actions monthly.
- High/critical runtime advisories fail unless a package/advisory-specific exception is unexpired and severity-bounded.
- Critical advisories are never accepted by the current policy script.
- The existing nested `sharp@0.34.5` advisory inside Next.js is temporarily accepted through 30 September 2026 because npm reports no compatible fix. The application uses `sharp@0.35.3`, Next image optimization is disabled, and private media never uses it.
- The exception expires automatically and must be removed or deliberately renewed with new evidence.

## Operational documents

- `docs/operations/RETENTION-DELETION-POLICY.md`
- `docs/operations/BACKUP-RESTORE-RUNBOOK.md`
- `docs/operations/INCIDENT-RESPONSE-RUNBOOK.md`
- `docs/operations/MONITORING-AND-ALERTS.md`
- `docs/operations/R2-SECURITY-POLICY.md`
- `docs/operations/PENETRATION-TEST-GATE.md`

Together they cover R2, database PII, provider email copies, logs, backups, deletion objectives, restoration reconciliation, credential rotation, incident containment, performance/security alerts, exact-origin CORS, bucket lifecycle, and external-test acceptance.

## Schema and environment changes

Unapplied migration:

`prisma/migrations/20260731230000_phase5_operations/migration.sql`

New production controls include:

- `AUDIT_LOG_SECRET`
- `RATE_LIMIT_SECRET`
- `HEALTH_CHECK_SECRET`
- `TURNSTILE_EXPECTED_HOSTNAMES`
- `OBSERVABILITY_WEBHOOK_URL` and `OBSERVABILITY_WEBHOOK_SECRET`
- `WEB_VITALS_SAMPLE_RATE`
- `AUDIT_RETENTION_DAYS`
- `EMAIL_LOG_RETENTION_DAYS`
- Optional approved `TICKET_RETENTION_DAYS`

`npm run production:verify` validates required values without printing secrets. It rejects password admin mode, setup token presence, secret reuse, non-HTTPS production URLs, `sslmode` weaker than explicit `verify-full`, identical R2 buckets, `r2.dev` public delivery, missing Turnstile hostnames, and local Turnstile hostnames.

## Verification results

| Check | Result | Evidence |
| --- | --- | --- |
| ESLint | Pass, zero warnings | `npm run lint` |
| TypeScript | Pass | `npm run typecheck` |
| Prisma schema and client | Pass | format, generate, validate |
| Phase 1–5 regression gate | Pass | `npm run quality:verify` |
| Phase 5 operations regression | Pass | `npm run operations:verify` |
| Production build | Pass; 44 static pages; Proxy registered | `npm run build` |
| Runtime dependency policy | Pass with one documented nested-Sharp exception | `npm run dependency:policy` |
| Production static page | Pass | `/weddings` rendered, mobile menu present, no overflow |
| Runtime production headers | Pass | CSP, HSTS, private/noindex, opener/resource, nosniff, and liveness observed after corrected Proxy placement |
| Production configuration | Not passed locally by design | Local environment lacks release secrets/migrations and uses `r2.dev`; the release script rejects these values |
| HTTPS deployment audit | Pending | Requires deployed staging/production URL |
| RUM p75/Lighthouse field gate | Pending | Requires deployed URL and representative traffic |
| External penetration test | Pending external action | Required by `PENETRATION-TEST-GATE.md` |
| Production database/R2 mutation | Not performed | No migration, cron, cleanup, upload, deletion, or provider change |

The local admin page returns an expected production-mode configuration error because `CSRF_SECRET` is intentionally absent from the local environment, and dynamic gallery routes cannot run against the unmigrated database. The Proxy still applied private/noindex headers to that error response. Full authenticated runtime testing belongs in the isolated staging gate after migrations and secrets are configured.

## Required production/staging release gate

1. Back up the database and export existing R2/provider policies.
2. Apply Phases 1, 2, 4, and 5 migrations in order to isolated staging, then production under a reviewed change window.
3. Configure distinct secrets, Google-only admin auth, explicit `sslmode=verify-full`, exact Turnstile hostnames, and approved retention values.
4. Replace every `r2.dev` public URL with the approved public custom asset domain and prove the private bucket has no public route.
5. Apply and export exact-origin R2 CORS/lifecycle/version-recovery policies from the R2 runbook.
6. Configure the monitoring webhook, alert rules, liveness/deep readiness probes, scheduled operations, and deployed-audit base URL.
7. Run `npm run production:verify` with production environment values and `npm run release:verify`.
8. Run `node scripts/verify-deployment.mjs https://…` and the three-run Lighthouse workflow.
9. Execute authorization-negative, forged-header, wrong Turnstile action/hostname, malicious upload, deletion interruption, and backup/restore tests using synthetic data.
10. Complete and record a restore drill, incident contact review, retention approval, and provider-policy evidence.
11. Commission the independent penetration test; remediate/retest or formally accept every finding under the documented rules.
12. Launch private galleries only after all critical/high findings and unaccepted high/critical dependency advisories are cleared.

Phase 5 is not production-released until every external and environment-specific item above is evidenced.

