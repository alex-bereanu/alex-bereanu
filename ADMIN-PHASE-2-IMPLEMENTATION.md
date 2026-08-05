# Admin Phase 2 — Gallery Workspace and Photo Management

**Project:** Alex Bereanu Photography  
**Date:** 2026-08-04  
**Status:** Implemented and verified behind a disabled feature flag  
**Database migration:** Created but intentionally not applied  
**Gallery or storage mutation:** None during implementation or verification

## User prompt

> continue with phase 2

This implements Phase 2 from `ADMIN-EXPERIENCE-INTEGRATION-PLAN.md` while preserving the security checkpoint approved in Phase 0. The shared database migration is not authorized until direct TLS verification, encrypted backup and isolated restore, production/staging configuration, the Sharp exception, and synthetic authorization/mobile tests all pass.

## Outcome

The dedicated gallery workspace now supports a clear Draft → Published → Archived lifecycle, visual photo management, batch operations, photo metadata, recoverable deletion, activity history, and authenticated public/private previews. New behavior is guarded by `ADMIN_GALLERY_PHASE2_ENABLED=false` by default.

The compatibility path remains safe before migration:

- No query reads a Phase 2 database column while the flag is disabled.
- Existing galleries continue to use `isActive` and existing gallery creation behavior.
- The additive migration defaults and backfills existing active galleries to Published.
- Once activated, newly created galleries explicitly start as Draft.
- Public and private galleries keep their current behavior until activation.

## Implemented gallery lifecycle

- Added `GalleryStatus`: Draft, Published, and Archived.
- Publishing requires at least one READY, non-recycled photo and no blocking upload, processing, failed, or deleting asset.
- `isActive` is synchronized during the compatibility period for safe rollback.
- Archiving immediately revokes active client links and increments their grant versions.
- Permanent gallery deletion is available only after archival when Phase 2 is enabled.
- Gallery lists and dashboard counts use lifecycle-aware filters after activation.

## Implemented photo workspace

- Responsive derivative-only thumbnail grid; Admin cards never render originals.
- Authenticated, private, no-store Admin preview media route.
- Existing resumable upload and bounded processing workflow preserved.
- Cursor-bounded loading; complete-gallery reordering is enabled only after all assets are loaded.
- Pointer drag, keyboard `Alt` + arrow movement, and visible Earlier/Later controls.
- Multi-select batch actions for Recycle, retry failed processing, and move to another gallery.
- Cross-gallery moves are restricted to galleries with matching storage visibility and cannot target Archived galleries.
- Per-photo alt text, caption, focal point, and capture-time editing.
- Processing state and failure reason remain visible per photo.

## Recoverable deletion and purge

- Removing a photo moves it to a 30-day Recycle Bin by default.
- Recycled photos are immediately excluded from public previews, private previews, pagination, counts, processing rebuilds, and authorized original downloads.
- Admins can restore a recycled photo during retention.
- Purge Now requires the literal confirmation `PURGE`.
- Permanent purge writes every original and derivative to the durable storage-deletion outbox before removing the asset record, then attempts immediate cleanup.
- The existing scheduled operations worker now purges expired recycled photos in bounded batches.
- Retention is configurable from 1 to 365 days through `GALLERY_RECYCLE_RETENTION_DAYS`.

## Preview and activity

- `/admin/galleries/[galleryId]/preview` is authenticated, no-index, and uses the same editorial gallery/lightbox presentation for Draft, Public, and Private galleries.
- Admin photo previews use authenticated derivative streams with private/no-store/no-index response headers.
- Gallery activity combines media-processing history with security audit events for lifecycle, details, ordering, metadata, recycle, restore, purge, batch actions, and relevant access operations.

## Security boundaries

- Every new Admin mutation requires an Admin request session and CSRF/origin verification.
- Every new mutation is rejected while Phase 2 is disabled.
- Batch requests are limited to 100 unique asset identifiers and verify gallery ownership.
- Actor data stored for recycle operations is HMAC-minimized rather than stored directly.
- Public discovery requires Published + Public after activation.
- Private share access requires Published + Private after activation.
- READY state, non-recycled state, capability authorization, expiry, revocation, and gallery ownership are rechecked at delivery boundaries.
- Original object keys and share secrets are not serialized into the Admin photo grid.

## Migration and activation

The additive migration is:

`prisma/migrations/20260804190000_admin_phase2_gallery_workflow/migration.sql`

It adds lifecycle, explicit client-delivery enablement, asset metadata, recycle timestamps, actor hash, checks, and indexes. It has not been run against the shared database.

Activation order after the Phase 0 gate passes:

1. Create and verify an encrypted backup and isolated restore.
2. Verify `DIRECT_DATABASE_URL` uses a direct PostgreSQL endpoint with `sslmode=verify-full`.
3. Apply and validate the migration in staging.
4. Run lifecycle/backfill counts and synthetic public/private authorization tests.
5. Deploy the compatible code with the flag still disabled.
6. Enable `ADMIN_GALLERY_PHASE2_ENABLED=true` in staging and complete desktop/mobile workflow tests.
7. Repeat the approved migration and activation sequence in production with rollback monitoring.

`prisma.config.ts` prefers `DIRECT_DATABASE_URL` for migration commands. Production configuration verification also rejects Phase 2 activation without a verified direct URL and a valid retention period.

## Verification results

| Check | Result |
|---|---|
| `npm run db:generate` | Pass — Prisma Client 7.9.1 generated |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run admin:phase0:verify` | Pass — 30 authenticated Admin POST routes |
| `npm run admin:phase2:verify` | Pass — lifecycle, migration gate, recycle, preview, and delivery exclusions |
| `npm run quality:verify` | Pass — security, media, performance, mobile/resume, and operations |
| `npm run build` | Pass — Next.js 16.2.12 production build |
| `npm run dependency:policy` | Pass — reported findings remain within the accepted policy |

## Deliberately deferred

- Applying or activating the migration before the security checkpoint passes.
- Page-content revisions and publishing workflow, which belong to Phase 3.
- Client-facing per-photo Save/Share and completed-delivery records, which belong to Phase 4.
- Retiring legacy archive/ZIP compatibility controls before individual-photo client delivery is verified.
- MFA/step-up authentication for Purge Now; the current explicit confirmation and audit trail are the interim safeguard, with stronger destructive-action controls scheduled for Phase 5.

## Review checkpoint

Phase 2 code is complete, but the new interface should not be enabled against the current shared database. The next release decision is whether to complete the remaining Phase 0 infrastructure checks and perform the migration first in staging. Until then, the local and deployed application remains on the verified Phase 1 compatibility path.
