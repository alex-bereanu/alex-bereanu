# Admin Phase 5 — Hardening, Accessibility, and Performance

## User prompt

> continue with phase 5

## Result

Phase 5 is implemented locally as a compatibility-safe hardening layer. It adds
no database migration, keeps `ADMIN_GALLERY_PHASE2_ENABLED`,
`ADMIN_CONTENT_PHASE3_ENABLED`, and
`ADMIN_CLIENT_DELIVERY_PHASE4_ENABLED` disabled, and does not modify existing
galleries, photos, share links, delivery records, or storage objects.

The Phase 0 infrastructure checkpoint is still blocked on the isolated
encrypted restore, staging provider configuration, synthetic private gallery,
real iOS/Android evidence, and external penetration test. Phase 5 code is ready;
the production exit gate is not approved until those external checks pass.

## Security hardening

- Irreversible gallery deletion, immediate photo purge, and legacy ZIP deletion
  now require a database-backed Admin session authenticated within
  `ADMIN_STEP_UP_MAX_AGE_SECONDS` (default 600 seconds).
- A stale Google session starts OAuth with `prompt=login` and `max_age=0`.
  Password-mode development requires a fresh password sign-in. A successful
  sign-in revokes the replaced session token.
- Google Workspace/account MFA must still be enforced and evidenced at the
  identity-provider level; the application cannot infer an MFA claim from this
  OpenID profile alone.
- JSON mutations receive HTTP 428 plus a same-origin reauthentication URL;
  form mutations receive a 303 redirect into the step-up flow.
- The inline destructive confirmation moves focus to the final action, supports
  Escape, warns screen readers, and expires after 15 seconds.
- Gallery deletion, photo purge, legacy archive deletion, media queue runs and
  retries, storage-deletion retries, and ticket mutations now record
  privacy-minimized success/failure audit events.
- Production configuration requires a 60–1800 second step-up window and a
  30–3650 day delivery-log retention period.

## Original-transfer resilience

- Single byte-range parsing is isolated and unit-checked for full, open-ended,
  suffix, clipped, invalid, and multi-range requests.
- The authorized private-original route retains private/no-store/no-index
  headers and adds an authenticated `HEAD` response for verified Phase 4
  originals without consuming a delivery record.
- Server telemetry distinguishes storage failures from source-integrity
  mismatches using a route template only.
- Mobile Share preparation reads the response stream incrementally, reports
  progress when `Content-Length` is available, and can be canceled with the
  same button. Failure states retain the direct full-quality Save fallback.
- A completed delivery record still requires a complete successful stream;
  canceled and partial transfers do not become successful deliveries.

## Privacy-minimized telemetry and retention

- Client delivery telemetry accepts only an allowlisted event, online/offline
  class, and grid/list surface. It rejects oversized or invalid payloads and is
  rate-limited.
- Telemetry contains no capability token, gallery/photo ID, filename, email,
  object key, signed URL, or request body.
- Admin Web Vitals remain grouped under `/admin`; private galleries remain
  grouped under `/g/[private]`.
- Scheduled maintenance emits the age of the oldest pending media job and
  prunes Phase 4 delivery records only when Phase 4 is enabled and
  `DELIVERY_LOG_RETENTION_DAYS` is configured. Photo objects are never
  age-deleted by this job.

## Accessibility and long-gallery performance

- Private photo actions retain 44-pixel controls, visible focus, semantic
  links/buttons, screen-reader labels, live status/error announcements,
  reduced-motion behavior, and left/right/bottom safe-area spacing.
- The homepage now has one descriptive `h1` before its `h2` sections.
- Header branding, Instagram, and footer links now expose at least 44-pixel
  mobile hit areas.
- Long Admin photo cards and private original rows use `content-visibility` and
  intrinsic-size containment. Private galleries remain cursor-paginated in
  bounded pages of 40; the lightbox bundle remains deferred.
- The first two mobile homepage mosaic images are eager candidates because both
  occupy the initial two-column viewport; only the first receives high fetch
  priority.
- Admin numeric tables use tabular figures; disabled and destructive controls
  have explicit visual states.

## Local browser evidence

The local development server was tested at 375 × 812 and the default desktop
viewport.

| Check | Result |
| --- | --- |
| Homepage heading order | `h1` followed by the About and Contact `h2` sections |
| Mobile horizontal overflow | None |
| Visible mobile targets below 44 × 44 pixels | None after remediation |
| `/admin` unauthenticated boundary | Redirected to `/admin/login?next=%2Fadmin` |
| Admin sign-in labels/autocomplete | No unlabeled controls; username and current-password autocomplete present |
| Step-up screen | Clear `Confirm Your Identity` heading, reason, sign-in controls, and alert |
| Browser console | No warning/error entries during the smoke test |

Authenticated gallery/client tests were not attempted because the required
schema migrations and feature flags remain deliberately inactive.

## Performance budgets and alerts

- Field budgets remain p75 LCP ≤ 2.5 seconds, INP ≤ 200 milliseconds, and
  CLS ≤ 0.1 after a representative minimum sample population.
- Warn when the oldest pending media job exceeds 10 minutes; page the owner at
  30 minutes during an active delivery window.
- Alert immediately on original-integrity mismatch. Alert on sustained storage,
  Share preparation, or Share failure rates only after a minimum sample count.
- Exercise at least 500 synthetic photos per private gallery in staging, with
  cursor pagination, slow network, canceled preparation, resumed range
  transfer, storage 404, and checksum mismatch scenarios.

## Recovery drill and rollback plan

Before Phase 5 production approval:

1. Complete the Phase 0 isolated database/R2 restore and deletion-ledger
   reconciliation.
2. Apply Phase 2, Phase 3, then Phase 4 migrations through the direct
   `sslmode=verify-full` endpoint and keep every flag false.
3. Deploy this Phase 5 hardening layer, verify Admin login and public routes,
   then enable one schema-backed flag at a time in staging.
4. Test stale-session step-up, irreversible-action cancellation, original
   `HEAD`/GET/range behavior, telemetry redaction, daily retention, and queue-age
   alarms with synthetic data.
5. Complete real iOS Safari, Android Chrome, desktop keyboard/screen-reader,
   reduced-motion, slow-network, interruption, and recovery tests.
6. Obtain the independent penetration-test report and close or explicitly
   accept every critical/high finding.

Rollback is configuration-first: disable Phase 4, then Phase 3, then Phase 2;
pause media and maintenance workers; retain additive columns/tables; revoke
synthetic shares; route traffic to the last known-good deployment; and reconcile
storage-deletion and delivery ledgers before resuming. Do not roll back with a
destructive schema migration or restore deleted client media into service.

## Verification completed

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run admin:phase0:verify` | Pass — 34 authenticated Admin POST routes |
| `npm run admin:phase2:verify` | Pass |
| `npm run admin:phase3:verify` | Pass |
| `npm run admin:phase4:verify` | Pass |
| `npm run admin:phase5:verify` | Pass |
| `npm run quality:verify` | Pass |
| `npm run dependency:policy` | Pass — 2 accepted/below-threshold findings |
| `npm run build` | Pass — Next.js 16.2.12, 53 pages |

## Gate decision

Phase 5 implementation and local verification are complete. Production release
approval remains blocked by the Phase 0 infrastructure checkpoint, real-device
tests, realistic staging load/failure drills, and the independent penetration
test. The local server remains available at `http://localhost:3000/` for review.
