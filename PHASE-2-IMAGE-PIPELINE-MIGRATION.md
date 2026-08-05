# Phase 2 Image Pipeline Migration

**Project:** Alex Bereanu Photography  
**Implementation date:** 31 July 2026  
**Repository:** `E:\github\alex-bereanu`  
**Local implementation status:** Complete  
**Production data/storage mutation:** In progress against the configured Neon database and R2 buckets

> **Subsequent update (31 July 2026):** Phase 3 has now been implemented locally and is recorded in `PHASE-3-PERFORMANCE-MIGRATION.md`. The production migration and live integration gates below remain unchanged.

## User prompts

> look at the the current website implementation and create a plan on how we can continue to develop it into a better version. Focus on improving image loading and overall performance of the website. UI looks good for now, but also take into consideration mobile functionality and performance. Security must also be key, as it will hold valuable personal photos. Before starting to implement the plan, let me review it and we can decide on the best approach. Consider all the relevant skills that you might need in developing the plan

> output all audit as a markdown file and make sure to include my prompt

> sounds good, let's implement Phase 1, including the security verification checkpoint before beginning the image pipeline migration

> looks good, continue with the rest of migration

> images displayed in the grid have low quality, what do you suggest we can do to display them at a much better quality?

> sounds good, let's implement the recommended approach

## Executive result

Phase 2 is implemented in the local worktree. Gallery images and archives now enter a server-owned upload session, land in quarantine, and remain unavailable until a durable processing job validates and publishes them. Images receive cache-versioned v2 derivatives at 800px/quality 82, 1440px/quality 84, and 2560px/quality 86 plus a compact placeholder. Preview metadata is stripped, pixel and dimension limits are enforced, and publication is fail-closed behind the `READY` state.

Source originals and gallery ZIP files are now retained in private storage even when a gallery is public. Only verified responsive derivatives for a public gallery are copied to the public bucket. Private-gallery derivatives continue to use authenticated same-origin delivery and never fall back to originals.

The checked-in database migrations are applied to the configured Neon database. A dedicated private R2 bucket holds verified source originals, and the controlled v2 derivative rebuild is in progress after a successful 10-photo quality sample.

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
- Responsive WebP derivatives are generated at maximum dimensions of 800px, 1440px, and 2560px with WebP quality levels 82, 84, and 86 respectively.
- A 24px WebP data placeholder is stored with the asset.
- Preview EXIF and other source metadata are not copied into generated derivatives.
- Variant generation within one job is sequential to limit peak memory; worker batch concurrency remains bounded.
- Object keys include the verified content hash, explicit `v2` recipe version, maximum dimension, and quality. This enables immutable public caching, immediate cache busting for the quality migration, and idempotent rebuilding.
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
- Public and authenticated grids expose native `srcset` candidates backed by the 800px and 1440px derivatives, so viewport width and device pixel ratio determine the delivered resolution without enabling the Next.js runtime optimizer.
- Mobile lightboxes use the 1440px derivative; desktop lightboxes prefer the 2560px derivative.
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
- The backfill command is dry-run by default and only queues durable rebuild jobs when `--execute` is explicitly supplied. `--rebuild-ready` selects READY v1 assets while excluding assets already on v2.
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
| Live migration/integration test | Pass | 1,076/1,076 assets READY on v2; zero active jobs |
| Database/R2 reconciliation | Pass | 3,228 public derivatives; 1,076 private originals; zero legacy derivatives or pending deletions |
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

## Live migration and v2 quality rebuild — 2026-07-31

- The four checked-in Prisma migrations are applied to the configured Neon database and `prisma migrate status` reports the schema as up to date.
- A dedicated `prod-data-portfolio-alexbereanu-private` R2 bucket holds verified source originals. It has no configured `r2.dev` hostname or public custom-domain route.
- The local environment explicitly maps `R2_PUBLIC_BUCKET_NAME` to the public derivative bucket and `R2_PRIVATE_BUCKET_NAME` to the private source bucket.
- The migration covered 1,076 legacy assets across 12 active public galleries.
- A controlled 10-photo v2 sample completed with zero failures. Browser inspection at device pixel ratio 1.5 confirmed native responsive candidate selection and visibly clean grid rendering before the full queue was released.
- The remaining 1,066 jobs were drained with three bounded workers. Individual Sharp pipelines remained sequential. Five image attempts entered the durable retry path and recovered; two HTTP claim requests encountered transient Neon `P2028` transaction-start timeouts and retried before claiming work. No terminal job failed.
- Final database verification reports 1,076 assets, 1,076 `READY`, 1,076 on v2, zero active jobs, and 1,336 completed job records. The higher job count includes the deliberate second rebuild of the 260 assets completed under v1.
- Final paginated R2 reconciliation reports exactly 3,228 public derivatives and 1,076 private source originals. There are zero missing expected objects, zero legacy v1 derivative objects, zero private-gallery derivative objects in this all-public dataset, and zero pending deletion jobs.
- Final homepage browser verification found 30 loaded photos, all 30 using v2 URLs, 40 responsive `<source>` elements, and zero broken images. The admin route continued to enforce authentication and redirected the clean test session to `Admin sign in`.
- The temporary local worker credential was removed immediately after completion. A replay using the removed credential returned `404`.
- `npm run lint`, `npm run typecheck`, `npm run quality:verify`, `npm run build`, `npm run images:verify:v2 -- --require-complete`, and `npm run images:verify:storage` all pass.

The v2 gallery image-quality migration is complete for every current asset. Original-image fallback remains prohibited, source originals remain private, and the Next.js runtime image optimizer remains disabled until its tracked nested Sharp dependency finding is resolved.
