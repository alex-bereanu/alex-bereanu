# Admin Phase 0 — Decisions, Security Verification, and Migration Readiness

**Project:** Alex Bereanu Photography  
**Checkpoint date:** 2026-08-04  
**Local implementation gate:** **PASS WITH CONDITIONS**  
**Shared database / production migration gate:** **HOLD**  
**Database and object-storage mutation:** None performed; inventory checks were read-only

## User prompts

> good, now let's focus on improving the Admin too. Create a plan first and let me review it first. Main goal is to take what was improved until now on website and integrate with a better Admin. Key points are: 
> - I want to be able to upload new galleries to the existing categories on the site, manage those galleries, add/remove photos
> - Custom names and texts for all site pages (I need to be able to update titles, texts and other assets that appear on each page of the website)
> - Create private links for each gallery, in order to be viewed by the clients and downloaded directly in the phone (keep the UI same as current website UI) but add download buttons for each photo and a general download for all photos in the gallery) full quality downloads.

> continue phase 0 with the recommended option for all 5, with one mention for no 1: let's also implement the option to later generate a new zip once the gallery is modified, and discard the previous zip file once the new is generated.

> actually let's rethink the use of zip files for downloads and simply download each individual photo to the client's device. This was it can be saved directly in a phones gallery (zip files cannot be stored directly in a phone photos gallery) and this would limit the functionality of the custom gallery private link

## Executive result

The five product decisions are locked, with the later individual-photo instruction superseding ZIP generation. No generated-bundle pipeline will be built. The client experience will offer a full-quality Save/Share action for every photo, with a protected full-resolution fallback when browser file sharing is unavailable.

The current application has a strong base for this work:

- All 1,076 originals are in private object storage.
- All 1,076 assets are READY on the v2 image pipeline.
- All 3,228 expected public derivatives exist.
- No media job, legacy derivative, or deletion job is pending.
- All Admin POST routes authenticate internally; all active mutation routes also verify CSRF/origin.
- Private original access is scoped to the authorized gallery and READY asset before a two-minute signed URL is issued.

Phase 0 passes for continued local Admin implementation, provided the identified design/security findings are fixed as part of that work. It does **not** authorize applying a new schema migration to the shared database or releasing client delivery. The production configuration, migration connection, backup/restore proof, and synthetic private-gallery test remain external gates.

## Approved product decisions

### 1. Individual full-quality delivery

Approved and revised: one explicit Save/Share action per photo. No generated ZIP, Download All ZIP, or bundle worker.

The existing archive route and Admin upload controls will remain only during a short rollback window, then be removed. The live database currently contains no gallery archive object, so no client ZIP data needs migration.

### 2. Structured page editor

Approved: typed page fields/assets with draft, preview, publish, revisions, and rollback. No unrestricted page builder or arbitrary HTML.

### 3. Gallery lifecycle

Approved: `DRAFT → PUBLISHED → ARCHIVED`, independent of public/private visibility.

### 4. Photo-save policy

Revised consequence of Decision 1: clients can save every photo while a link remains authorized. Track completed per-photo delivery for activity, but do not disable a link based on raw request counts. Expiry, password, explicit revocation, gallery publication state, and the delivery-enabled setting are the default controls.

### 5. Recoverable deletion

Approved: 30-day Recycle Bin, immediate removal from public/client results, Restore during retention, and explicit Purge Now through the durable deletion worker.

## Mobile delivery decision

The Web Share API supports file sharing through an operating-system share target, including an array of files, but `share()` requires transient user activation and the available destinations are chosen by the browser/operating system. Support and shareable file types must be checked at runtime with `navigator.canShare()`. Sources: [W3C Web Share Recommendation](https://www.w3.org/TR/web-share/) and [MDN Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API).

Therefore, the product must not promise silent saving directly into Photos.

### Approved client interaction

1. The optimized grid/lightbox keeps the current website UI.
2. Every image has a **Save full-quality photo** action.
3. When a prepared image passes `navigator.canShare({ files: [file] })`, the action opens the system share sheet; the client chooses Save Image/Photos if the device offers it.
4. Otherwise, the action opens an authorized full-resolution image view with concise press-and-hold/save guidance and a separate Download Original action.
5. Each photo requires an explicit client gesture. The site will not launch dozens of automatic downloads.

### Technical implication

Use a same-origin authorized streaming endpoint for the file-sharing path. This avoids exposing a capability token or private object key to a third party and avoids requiring JavaScript to read a cross-origin signed response. The browser must still materialize the selected file before invoking the share sheet, so only one original is prepared at a time and large-file behavior must be tested on real phones.

The conventional Download Original fallback can continue to redirect to a short-lived private signed URL after authorization.

## Read-only live inventory

Inventory timestamp: `2026-08-04T14:08:00.509Z`.

### Database migration history

The Prisma migration table is present. All four existing migrations are finished and none is rolled back:

- `20260731090000_phase1_security`
- `20260731140000_phase2_media_pipeline`
- `20260731190000_phase4_resumable_uploads`
- `20260731230000_phase5_operations`

`prisma migrate status` itself returned a schema-engine error through the current pooled Neon connection. Direct Prisma queries work. A separate migration-safe direct database URL is required before creating/applying the Admin migration.

### Galleries

| Metric | Result |
|---|---:|
| Total | 12 |
| Active | 12 |
| Public | 12 |
| Private | 0 |
| Without assets | 0 |
| With archive object | 0 |
| Archive status NONE | 12 |

Category counts:

| Category | Galleries |
|---|---:|
| Automotive | 5 |
| Weddings | 3 |
| Landscapes | 2 |
| Portraits | 2 |
| Product | 0 |
| Corporate | 0 |
| Custom | 0 |

### Assets and storage

| Metric | Result |
|---|---:|
| Total assets | 1,076 |
| READY | 1,076 |
| V2 variants | 1,076 |
| Private originals | 1,076 |
| Expected/found public derivatives | 3,228 / 3,228 |
| Assets belonging to private galleries | 0 |
| Private-gallery derivatives | 0 |
| Legacy derivative objects | 0 |
| Active media jobs | 0 |
| Pending storage deletions | 0 |

### Share links

| Metric | Result |
|---|---:|
| Historical records | 6 |
| Active secure links | 0 |
| Legacy rows without a token hash | 6 |
| Expired | 1 |
| Password-protected historical rows | 5 |
| Rows with a request limit | 0 |

The six legacy rows were disabled by the prior security migration. There is no active client-link population to preserve. New secure links can use the current hashed capability design.

### Website content

The database has three content overrides:

- `home.about`
- `home.contact`
- `social.instagram`

Code defaults currently provide ten registered entries, including the portfolio index and six portfolio categories. Several visible areas are still code-only, including:

- Brand name/tagline.
- Header and footer navigation labels.
- Wedding microsite heading, body, reserved-section text, and CTA content.
- Form labels, success/error copy, and empty states.
- Page metadata/SEO/share assets.
- Private-gallery access instructions and save guidance.

Phase 3 must complete the visible-content inventory before defining the revision schema.

## Security verification

### Passed controls

| Control | Result | Evidence |
|---|---|---|
| Admin POST-route authentication | Pass | 25/25 POST routes call `requireAdminRequestSession` internally |
| Admin mutation protection | Pass | Every active mutating POST route verifies CSRF/origin; the one exception is an authenticated legacy archive relay that always returns 413 and performs no mutation |
| Input validation | Pass baseline | Current gallery/content/share/upload routes use bounded Zod/file validation |
| Capability entropy and storage | Pass | 32 random bytes; SHA-256 hash stored; capability shown only at creation |
| Access-cookie security | Pass baseline | Production `__Host-` name, HttpOnly, Secure, SameSite Strict, Path `/`, two-hour maximum |
| Original IDOR protection | Pass baseline | Asset ID must belong to the authorized gallery and be READY |
| Signed original URL | Pass baseline | Created only after authorization; two-minute lifetime; attachment filename sanitized by the storage service |
| Private response policy | Pass | No-store/no-cache, no-index/noarchive, no-referrer, `Vary: Cookie` |
| Original storage boundary | Pass | All 1,076 sources are private |
| Preview boundary | Pass | Private previews use authenticated routes and do not fall back to originals |
| Media verification | Pass | Signature/hash/size/processing gates and READY state |
| Deletion durability | Pass | Database outbox written transactionally; retries supported; no pending jobs |
| Negative runtime check | Pass | Invalid original request returned 404 with private headers; unauthenticated Admin mutation redirected to login with private headers |
| Existing Phase 1–5 gates | Pass | `npm run quality:verify` |
| Lint | Pass | `npm run lint` |
| TypeScript | Pass | `npm run typecheck` |
| V2 database/storage verification | Pass | Complete asset and object inventory |

### Findings to resolve in implementation

#### A0-01 — Raw request counter is incompatible with individual saving

**Priority:** High, release blocker for new client saving.

`recordGalleryShareLinkDownload()` increments `downloadCount` before redirecting to storage. Retries, canceled transfers, or repeated taps count as new downloads. The private page also hides all downloads after this raw counter reaches its limit.

Required resolution:

- Do not enforce the old raw-request limit in the new path.
- Add a privacy-minimized per-link/per-asset delivery record or equivalent activity aggregate.
- Distinguish attempted, authorized, and successfully initiated/completed delivery as far as the chosen transfer design can reliably observe.
- Never count preview requests.
- Keep old fields during rollback, but stop using them for the new client UI.

#### A0-02 — Client delivery is incorrectly coupled to `PRIVATE` visibility

**Priority:** High, functional blocker for “private links for each gallery.”

The current authorization service and share-link creation require an active `PRIVATE` gallery. All 12 live galleries are `PUBLIC`, and gallery visibility cannot be changed while stored assets exist. As a result, none of the current galleries can receive a new secure client link through the current Admin.

Required resolution:

- Add `clientDeliveryEnabled`, default false for migrated galleries.
- Allow a Published public or private gallery to create an original-delivery share grant only after an Admin explicitly enables delivery.
- Keep visibility responsible for public discovery/previews.
- Keep the share grant responsible for private originals.
- Re-authorize gallery status, delivery-enabled state, link state, grant version, and asset membership on every original request.

#### A0-03 — No active private-client runtime fixture

**Priority:** High, staging gate.

There is no active private gallery or active secure share link in the live dataset, so a complete password/unlock/preview/save/revoke test cannot be performed without creating data.

Required resolution: create a synthetic staging gallery containing non-personal test images after the migration backup and staging schema are ready. Do not use client photos for the first security test.

#### A0-04 — Production environment gate fails locally

**Priority:** High, production release blocker; expected for this local environment.

The safe production verifier reports missing production secrets/provider settings, non-HTTPS local URLs, `r2.dev` public delivery, absent Turnstile/observability/retention configuration, non-Google Admin mode, and a database URL without explicit `sslmode=verify-full`.

These values must be supplied through the production secret/provider configuration; they must not be committed to the repository.

#### A0-05 — Migration CLI needs a direct database connection

**Priority:** High, schema-migration blocker.

The application can query the pooled Neon database, and the migration table confirms all prior migrations. Prisma's schema engine could not complete `migrate status` through the current connection.

Required resolution:

- Add a separate secret such as `DIRECT_DATABASE_URL` using the provider's non-pooled migration endpoint and explicit `sslmode=verify-full`.
- Configure Prisma migrations to use the approved direct URL while the runtime retains the pooled URL.
- Re-run `migrate status` before generating or applying the Admin migration.

#### A0-06 — Backup/restore proof is not available locally

**Priority:** High, shared-database migration blocker.

Do not write an unencrypted database dump containing client metadata into the repository. The database owner must create an encrypted/provider snapshot and restore it into isolated staging. The restored counts/hashes must match this inventory before any new migration is applied.

#### A0-07 — Dependency advisory remains accepted, not fixed

**Priority:** Conditional production risk.

`npm audit --omit=dev` reports two high-severity entries through Next.js's nested Sharp version, with no compatible fix reported. The repository's dependency policy passes because of the existing time-limited exception. Direct application processing uses patched Sharp 0.35.3, the Next image optimizer is disabled, and private media bypasses it.

Required resolution: keep the exception visible and time-bounded, adopt the first compatible patched Next.js release, and re-run the full media regression gate. Do not silently renew the exception.

#### A0-08 — Original metadata policy requires an explicit choice

**Priority:** Medium, privacy decision before client release.

The current original endpoint delivers the uploaded source. This preserves full quality but can also preserve EXIF metadata, including camera/device information and potentially location if present.

Recommended implementation: keep the untouched original available only if the photographer deliberately wants source files delivered. Otherwise generate a full-resolution, metadata-scrubbed client export and label it “Full resolution” rather than “Original.” This choice must be recorded before Phase 4.

#### A0-09 — Capability hash comparison is not constant-time

**Priority:** Low defense-in-depth.

The presented token is SHA-256 hashed and compared to the authorized capability hash with string equality. The 256-bit random token and cookie-bound comparison make practical exploitation unlikely, but a fixed-length timing-safe comparison is the preferred implementation.

## Threat model for the approved design

| Threat | Required control |
|---|---|
| Guessing or enumerating a client URL | 256-bit capabilities, hashed at rest, uniform failures, rate limits |
| Token leakage through referrers/logs | No-referrer, no external resources, redacted route telemetry/logs, no tokens in audit metadata |
| Reusing a revoked/expired link | Database revalidation on every preview/original request; grant-version rotation |
| IDOR by changing an asset ID | Query by both authorized gallery ID and asset ID; require READY and not deleted |
| Public gallery exposing originals | Separate `clientDeliveryEnabled` and share authorization; visibility alone never grants originals |
| Removed photo remains downloadable | `deletedAt`/status checked on every request; immediate cache/access invalidation |
| Signed URL reuse | Very short lifetime, private bucket, attachment/inline policy, no-referrer |
| Browser fetch exhausts server memory | Stream server-to-client; never buffer the whole original in application memory |
| Browser share exhausts phone memory | Prepare one file only; capability/size checks; direct-view/download fallback |
| Raw request quota denies valid clients | Do not gate on HTTP request count; track privacy-minimized delivery outcomes |
| Admin content injects active code | Typed fields, React escaping, no arbitrary HTML, strict asset validation |
| Accidental permanent deletion | Recycle Bin, explicit purge, step-up confirmation, durable deletion outbox |
| Schema migration loses gallery data | Additive migration, verified backup/restore, staging rehearsal, invariant report, rollback flags |

## Proposed additive migration design

No migration file is created in Phase 0. The following is the reviewed shape for the later implementation.

### Gallery

- Add `status` with `DRAFT`, `PUBLISHED`, `ARCHIVED`.
- Add `clientDeliveryEnabled Boolean @default(false)`.
- Backfill active galleries to PUBLISHED and inactive galleries to DRAFT.
- Keep `isActive` temporarily for rollback compatibility.

### GalleryAsset

- Add `altText`, `caption`, optional focal-point fields.
- Add `deletedAt`, `purgeAfter`, and a privacy-safe deletion actor reference if available.
- All read/download queries must exclude recycled assets.

### GalleryShareLink

- Retain hashed token, grant version, password, expiry, active/revoked state.
- Deprecate `downloadCount` and `maxDownloads` for the new UI; do not drop them in the first migration.
- Add optional `recipientLabel` only if needed; treat recipient email as retained personal data.

### Photo delivery activity

Add a privacy-minimized delivery record or aggregate containing:

- Share-link ID and asset ID.
- Outcome from a small enum such as AUTHORIZED, REDIRECTED/STREAM_STARTED, FAILED.
- Timestamp and optional bounded reason code.
- No capability, password, signed URL, object key, filename, raw IP, or email.

The implementation must define whether “completed” can be observed reliably. A signed redirect generally proves authorization/redirect, not that the phone finished saving the file.

### Content revisions

Content revision tables belong to the Pages phase, not the first gallery-shell migration. They should remain additive and resolve one explicit published revision per typed content key.

### No bundle model

Do not add `GalleryBundle`, archive-version, ZIP-worker, manifest, or bundle-download fields.

## Migration and rollback plan

### Before applying a migration

1. Configure `DIRECT_DATABASE_URL` with explicit certificate verification.
2. Make an encrypted/provider backup and restore it into isolated staging.
3. Run the Phase 0 inventory against the restore and compare counts.
4. Run `prisma migrate status` successfully through the direct endpoint.
5. Apply the additive migration to staging only.
6. Run gallery/asset/share/content invariant queries.
7. Create a synthetic private/client-delivery gallery and exercise the full negative/positive access matrix.

### Safe release sequence

1. Deploy schema-compatible code with new features disabled.
2. Apply additive schema migration.
3. Backfill lifecycle values; leave `clientDeliveryEnabled=false` everywhere.
4. Enable the new Admin shell for the authorized Admin only.
5. Enable client delivery on the synthetic gallery and test real iOS Safari/Android Chrome.
6. Enable delivery deliberately per real gallery after review.
7. Remove archive controls/routes after the observation window; there are currently no archive objects.
8. Drop deprecated columns only in a later migration after rollback is no longer required.

### Rollback

- Disable the new Admin/client-delivery feature flags.
- Continue reading `isActive` and the existing content records.
- Do not roll back by deleting new columns or rows during the incident.
- Revoke affected share links by incrementing grant versions.
- Restore application code first; use the verified database restore only for actual data corruption.

## Verification evidence

| Command/check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run quality:verify` | Pass; Phase 1–5 security/performance/mobile/operations checks |
| `npm run admin:phase0:verify` | Pass; 33 authenticated POST routes plus private download/content/deletion and fail-closed infrastructure-gate assertions |
| `npm run admin:phase0:inventory` | Pass; read-only live aggregate inventory |
| `npm run images:verify:v2 -- --require-complete` | Pass; 1,076/1,076 READY v2 assets and no active job |
| `npm run images:verify:storage` | Pass; all expected private sources/public derivatives exist |
| Invalid original runtime request | Pass; 404 plus private/no-index/no-referrer headers |
| Unauthenticated Admin mutation | Pass; redirected to Admin login plus private headers |
| `npm run dependency:policy` | Pass with existing time-limited nested-Sharp exception |
| `npm audit --omit=dev` | Conditional; two high findings in Next's nested Sharp, no fix reported |
| Production configuration verifier | Expected fail locally; production secrets/provider policies absent |
| Prisma migration table | Pass; four migrations complete, none rolled back |
| Direct database TLS | Pass on 2026-08-04; the inferred non-pooled Neon endpoint completed the read-only Phase 0 inventory with `sslmode=verify-full`, and the Node PostgreSQL client reported an authorized TLS 1.3 stream |
| Prisma CLI migration status | Prisma schema-engine status remains unsuitable through the local pooled configuration; migration commands must use the explicit staging `DIRECT_DATABASE_URL` |
| Backup and restored-staging comparison | Pending operator/provider action |
| End-to-end secure client save | Pending synthetic staging data and real phone testing |
| `npm run admin:phase0:checkpoint` | Correctly blocked in development before migrations: staging secrets/provider policies, isolated restore evidence, and real-device attestations are absent |

## Phase 0 gate decision

Phase 0 is complete for planning and local implementation readiness.

Local Phase 1 Admin-shell work may proceed without applying database migrations. Any gallery lifecycle/share-delivery schema work must remain unapplied until all of the following are evidenced:

1. Direct migration URL with `sslmode=verify-full` works.
2. Encrypted backup and isolated restore are verified.
3. Production/staging secrets and provider policies pass the safe configuration verifier.
4. The accepted nested-Sharp exception is still valid or the dependency is patched.
5. A synthetic client gallery passes authorization, revocation, deleted-photo, original-stream, Share/Save, and mobile fallback tests.

The fail-closed `npm run admin:phase0:checkpoint` command now enforces these
operator-controlled requirements. It cannot pass from the development `.env.local`:
it requires a distinct restored database endpoint, encrypted-backup and storage
restore references, the full staging production-configuration set, and recorded
authorization plus iOS/Android results. Phase 2, Phase 3, and Phase 4 flags must remain off
while the pre-migration checkpoint runs.

The implementation plan incorporating these decisions remains in `ADMIN-EXPERIENCE-INTEGRATION-PLAN.md`.
