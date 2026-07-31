# Phase 2 Image Pipeline Migration

**Project:** Alex Bereanu Photography  
**Implementation date:** 31 July 2026  
**Repository:** `E:\github\alex-bereanu`  
**Local implementation status:** Complete  
**Production data/storage mutation:** Not performed

> **Subsequent update (31 July 2026):** Phase 3 has now been implemented locally and is recorded in `PHASE-3-PERFORMANCE-MIGRATION.md`. The production migration and live integration gates below remain unchanged.

## User prompts

> look at the the current website implementation and create a plan on how we can continue to develop it into a better version. Focus on improving image loading and overall performance of the website. UI looks good for now, but also take into consideration mobile functionality and performance. Security must also be key, as it will hold valuable personal photos. Before starting to implement the plan, let me review it and we can decide on the best approach. Consider all the relevant skills that you might need in developing the plan

> output all audit as a markdown file and make sure to include my prompt

> sounds good, let's implement Phase 1, including the security verification checkpoint before beginning the image pipeline migration

> looks good, continue with the rest of migration

## Executive result

Phase 2 is implemented in the local worktree. Gallery images and archives now enter a server-owned upload session, land in quarantine, and remain unavailable until a durable processing job validates and publishes them. Images receive versioned 480px, 1280px, and 2560px WebP derivatives plus a compact placeholder. Preview metadata is stripped, pixel and dimension limits are enforced, and publication is fail-closed behind the `READY` state.

Source originals and gallery ZIP files are now retained in private storage even when a gallery is public. Only verified responsive derivatives for a public gallery are copied to the public bucket. Private-gallery derivatives continue to use authenticated same-origin delivery and never fall back to originals.

No database migration was applied, no R2 object was copied or deleted, and no backfill was executed. Those production-facing actions remain a deliberate deployment checkpoint.

## Implemented ingestion flow

1. The browser computes a streaming SHA-256 checksum without loading the entire file into JavaScript memory.
2. The authenticated admin requests an upload session containing the gallery, kind, expected filename, content type, size, and checksum.
3. The server creates an expiring, unguessable quarantine key and returns a signed upload URL with required server-bound metadata headers.
4. The browser uploads directly to the correct R2 bucket. Images up to 20 MB retain a server-relay fallback; large images and all archives remain direct-to-storage to protect application memory.
5. Finalization accepts only upload-session IDs. Client-provided object keys, dimensions, sizes, and derivative metadata are not trusted.
6. A durable database job is queued. Opportunistic `after()` processing may reduce latency, but correctness does not depend on request lifetime.
7. The worker claims jobs with `FOR UPDATE SKIP LOCKED`, detects stale locks, applies bounded retries with backoff, and records safe failure codes.
8. Only a successful atomic publication step changes an asset or archive to `READY`.

## Image verification and derivative generation

- Exact object size, content type, upload-session metadata, and SHA-256 are checked against server-stored expectations.
- File signatures must agree with declared JPG, PNG, WebP, GIF, or AVIF types.
- Sharp uses strict warning handling and an 80-megapixel input ceiling.
- Images over 20,000 pixels on either dimension, malformed decodes, and animated/multi-page inputs are rejected.
- Responsive WebP derivatives are generated at maximum dimensions of 480px, 1280px, and 2560px.
- A 24px WebP data placeholder is stored with the asset.
- Preview EXIF and other source metadata are not copied into generated derivatives.
- Variant generation within one job is sequential to limit peak memory; worker batch concurrency remains bounded.
- Object keys are versioned with the verified content hash, enabling immutable public caching and idempotent rebuilding.
- Source originals are uploaded to the private bucket under `sources/galleries/...`, including originals belonging to public galleries.

## Archive safeguards

- ZIP uploads are disabled unless both `MEDIA_SCANNER_URL` and `MEDIA_SCANNER_SECRET` are configured.
- Archives upload directly to private quarantine; the application does not buffer a potentially 1 GB archive.
- The scanner receives a short-lived private download URL and must return both a clean result and the expected SHA-256.
- A failed, unavailable, or malformed scanner response cannot publish an archive.
- Only a clean archive is promoted to the private archive namespace and marked `READY`.

The scanner is an external dependency and is intentionally not implemented inside this repository. Its production service must stream the object, enforce decompression and entry limits, detect encrypted/nested archive policy violations, scan for malware, and independently calculate the full SHA-256.

## Delivery and browser performance changes

- Public and private gallery queries include only `READY` assets.
- Archives are downloadable only when their archive state is `READY`.
- Public grids use the 480px derivative and never use a source original as a fallback.
- Mobile lightboxes use the 1280px derivative; desktop lightboxes prefer the 2560px derivative.
- Private delivery supports authenticated `small`, `medium`, and `large` variants.
- Exactly one initial gallery/mosaic image is eager and high priority; the remaining images use normal lazy loading.
- Browser upload hashing is chunked and reports progress for images and archives.
- The file picker explicitly limits gallery images to the formats supported by server validation, avoiding accidental HEIC selection followed by a late failure.
- New public site-content photos are strictly decoded and converted before database publication; only stripped responsive derivatives are retained, so no new source-original fallback is exposed.

## Operations and recovery

- The admin overview shows queued/active media jobs and recent failed jobs.
- An authenticated, CSRF-protected admin action can process a bounded queue batch.
- Failed jobs expose only safe error codes and can be reset for retry.
- `/api/internal/media-worker` accepts either `MEDIA_WORKER_SECRET` or Vercel's `CRON_SECRET` using timing-safe comparison.
- `vercel.json` schedules a small worker batch every five minutes. The deployment platform and plan must support that schedule; otherwise invoke the same endpoint from an approved external scheduler.
- Expired abandoned upload sessions are reconciled into the storage-deletion outbox.
- Asset, archive, and gallery deletion now includes large variants, private source originals, legacy storage locations, and outstanding quarantine objects.
- The backfill command is dry-run by default and only queues durable rebuild jobs when `--execute` is explicitly supplied.
- Active rebuild jobs are deduplicated.

## Database migration

The migration is located at:

`prisma/migrations/20260731140000_phase2_media_pipeline/migration.sql`

It adds:

- `MediaStatus`, `ArchiveStatus`, `MediaUploadKind`, `MediaUploadStatus`, `MediaJobType`, and `MediaJobStatus` enums;
- source/archive storage-area tracking;
- large derivative, content hash, placeholder, verification, readiness, and failure metadata;
- `MediaUploadSession` and `MediaProcessingJob` tables with required indexes and foreign keys;
- legacy-state initialization that leaves assets with missing derivatives in `FAILED` rather than publishing original fallbacks.

The Phase 1 baseline warning still applies: if production was created with `prisma db push`, rehearse and baseline migration history before using `prisma migrate deploy`.

## Verification results

| Check | Result | Command/evidence |
| --- | --- | --- |
| Prisma format and client generation | Pass | `node scripts/prisma-env-runner.mjs format`; `npm run db:generate` |
| Prisma schema validation | Pass | `node scripts/prisma-env-runner.mjs validate` |
| ESLint | Pass, zero warnings | `npm run lint` |
| TypeScript | Pass | `npm run typecheck` |
| Phase 1 security regression gate | Pass | `node scripts/verify-phase1-security.mjs` |
| Phase 2 media regression gate | Pass | `node scripts/verify-phase2-media.mjs` |
| Production build | Pass | `npm run build` using Next.js 16.2.12 |
| Git whitespace check | Pass | `git diff --check` |
| Production dependency audit | Conditional hold | Two linked high findings: Next's nested Sharp 0.34.5; no available npm fix |
| Live migration/integration test | Not performed | No approved staging or production database/R2 mutation in this task |
| Malware scanner integration test | Not performed | External scanner endpoint and synthetic test archive are required |

The static Phase 2 regression gate checks quarantine ownership, durable jobs, strict image limits, private source storage, archive scanning, `READY`-only delivery, deletion coverage, and controlled backfill behavior. It does not replace a live end-to-end test against staging Postgres and R2.

## Required deployment sequence

1. Back up production Postgres and inventory existing gallery assets, archives, visibility, and active share links.
2. Restore the database to staging and rehearse the Phase 1 and Phase 2 migrations in their recorded order.
3. Confirm the migration's legacy `sourceStorageArea` and `archiveStorageArea` values match the real current object locations.
4. Configure public and private R2 buckets. The private bucket must have no `r2.dev` or public custom-domain access.
5. Configure direct-upload CORS only for the real admin origin, `PUT`, and the required `Content-Type`, `Cache-Control`, and `x-amz-meta-*` headers.
6. Configure independent 32+ character values for `MEDIA_WORKER_SECRET`, `CRON_SECRET`, and `MEDIA_SCANNER_SECRET`.
7. Deploy and test one synthetic public gallery and one synthetic private gallery before processing existing photos.
8. Verify malformed, mislabeled, checksum-mismatched, oversized, animated, and pixel-bomb images remain unavailable and finish in a safe failure state.
9. Verify a synthetic ZIP cannot become available unless the external scanner returns the exact expected hash and a clean result.
10. Run `npm run images:backfill -- --limit=100` and review the dry-run inventory.
11. Only after review, run `npm run images:backfill -- --limit=100 --execute` to enqueue a small batch.
12. Process the queue, verify object placement and image quality, then repeat controlled batches.
13. Confirm every intended published asset is `READY`, has all three derivatives and a placeholder, and has its source original in private storage.
14. Confirm old originals/variants are represented by completed or pending deletion-outbox jobs and reconcile any failures.

## Remaining release gates

### Live security and data-integrity proof

- Anonymous requests to private originals, derivatives, archives, and storage hostnames must return `403` or `404`.
- Share revocation, expiry, gallery deactivation, and grant-version rotation must immediately deny private previews and downloads.
- Public page HTML/RSC must contain only public derivative URLs, never private source keys or signed URLs.
- Interrupted jobs must retry without duplicate assets or partially published metadata.
- Scanner timeouts and failures must leave the previous archive intact and the candidate unavailable.

### Residual dependency finding

`npm audit --omit=dev` still reports two linked high-severity records because Next.js 16.2.12 bundles Sharp 0.34.5. Application-owned processing uses Sharp 0.35.3, and the Next image optimizer remains globally disabled as a compensating control. Adopt the first supported Next version that resolves the nested dependency and repeat the full build/media test suite. This risk should remain explicitly tracked until resolved or accepted.

### Work intentionally not claimed as complete

The Phase 2 media migration is complete in code, but later audit phases remain separate work: database cursor pagination for 1,000-photo galleries, interaction-only lightbox code splitting, resumable/multipart uploads across reloads, mobile navigation redesign, distributed rate limiting, stricter CSP rollout, operational retention/audit events, and external penetration testing.

## Files to review first

- `prisma/schema.prisma`
- `prisma/migrations/20260731140000_phase2_media_pipeline/migration.sql`
- `src/server/services/media-upload-sessions.ts`
- `src/server/services/media-processing.ts`
- `src/server/services/storage.ts`
- `src/app/api/internal/media-worker/route.ts`
- `src/app/api/gallery-media/assets/[assetId]/[variant]/route.ts`
- `src/components/admin-asset-upload.tsx`
- `src/components/admin-archive-upload.tsx`
- `scripts/backfill-image-variants.mjs`
- `scripts/verify-phase2-media.mjs`
- `.env.example`

The original audit remains in `WEBSITE-PERFORMANCE-MOBILE-SECURITY-AUDIT.md`, and the preceding checkpoint remains in `PHASE-1-SECURITY-CHECKPOINT.md`.
