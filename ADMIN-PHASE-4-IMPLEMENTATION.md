# Admin Phase 4 — Private Client Links and Individual Full-Quality Saving

## User prompt

> continue with phase 4

## Result

Phase 4 is implemented behind the disabled-by-default
`ADMIN_CLIENT_DELIVERY_PHASE4_ENABLED` feature flag. It completes the code path
for private client delivery without enabling it against the shared database or
mutating existing galleries, share links, R2 objects, or migrations.

The Phase 0 infrastructure checkpoint is still blocked on an encrypted isolated
restore, complete staging configuration, a synthetic private gallery, and real
iOS/Android evidence. Phase 4 therefore remains on the existing compatibility
path until those external gates pass.

## Approved delivery model

- Each photo has an individual full-quality Save action.
- Phones with file-capable Web Share receive a two-gesture Share flow: prepare
  the verified original, then tap again to open the system share sheet with a
  fresh user activation.
- Every client retains an ordinary attachment download and authorized inline
  original-view fallback.
- ZIP generation and ZIP upload are absent from the normal Admin workflow.
- Existing legacy ZIP objects can only be deleted through the durable deletion
  outbox; archive download returns 404 after Phase 4 activation.

## Additive schema

The gated migration adds:

- `GalleryDeliveryMethod`: `DOWNLOAD`, `SHARE`, or `ORIGINAL_VIEW`.
- `GalleryAssetDelivery`, unique by secure link and photo.
- First/latest completed-delivery timestamps, transfer method, verified source
  hash snapshot, and source byte size.
- Self-referential share-link replacement fields. Replacement creation and old
  link revocation occur atomically.

Repeated transfers update the same delivery row. There is no raw HTTP request
counter in the Phase 4 policy and no retry penalty.

## Authorization and original streaming

Phase 4 access requires a valid gallery cookie, matching capability hash,
current grant version, active unexpired link, private Published gallery with
delivery enabled, and a `READY`, non-recycled photo in that gallery.

The original route streams from private R2 using Web Streams and supports a
single validated byte range. It never buffers the original in application
memory. Before sending, it verifies the R2 `content-sha256` metadata and source
size against the verified database record. Private/no-store/no-index/no-referrer
headers are returned on original and error responses.

A delivery row is written only when a complete original stream flushes. Partial
ranges, canceled transfers, authorization failures, missing/recycled photos,
and storage-integrity failures do not create successful-delivery records.

## Admin experience

- Explicit client-delivery enable/disable control.
- Activation only for a Published private gallery whose active photos are all
  `READY` with verified source hashes.
- Immediate link revocation when delivery is disabled, unpublished, or archived.
- Link creation, password/email/expiry, atomic replacement, derived status,
  last-opened time, delivered-photo count, and revoke controls.
- Bounded latest-100 unique photo-delivery table with source proof.
- Legacy ZIP cleanup only; no ZIP upload component in the workspace.

## Client experience

The private gallery keeps the current site visual language and optimized preview
grid. Full-quality actions appear on every grid photo, in the lightbox, and in a
readable original-files list. The mobile Share flow securely prepares one file,
then asks for a second tap so the native share sheet receives a fresh user
gesture. One-tap Save and Open original remain universal fallbacks.

Controls use 44-pixel touch targets, safe-area spacing, visible focus,
screen-reader labels, reduced-motion compatibility, responsive columns, and
clear preparation/error feedback.

## Activation order

1. Complete `npm run admin:phase0:checkpoint` in isolated staging.
2. Apply Phase 2, then Phase 4 through the direct `sslmode=verify-full` endpoint.
3. Compare pre/post gallery, photo, link, and archive invariants.
4. Deploy with `ADMIN_CLIENT_DELIVERY_PHASE4_ENABLED=false`.
5. Create a synthetic Published private gallery with known-hash test images.
6. Enable both Phase 2 and Phase 4 flags in staging.
7. Test valid, invalid, expired, revoked, replaced, cross-gallery, recycled,
   partial-range, interrupted, hash-mismatch, and complete-original requests.
8. Verify Save/Share and fallback behavior on real iOS Safari and Android Chrome.
9. Delete any legacy ZIP through the outbox and verify object removal.

## Verification completed

| Check | Result |
|---|---|
| Prisma client generation | Pass — Prisma 7.9.1 |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run admin:phase0:verify` | Pass — 34 authenticated Admin POST routes |
| `npm run admin:phase4:verify` | Pass |
| `npm run quality:verify` | Pass — security, media, performance, mobile, and operations |
| `npm run dependency:policy` | Pass — two accepted/below-threshold findings |
| `npm run build` | Pass — Next.js 16.2.12, 52 pages |

Authenticated Phase 4 browser/device tests remain deferred until
the migration and feature flag exist in isolated staging.

## Gate decision

Phase 4 code is complete but inactive. No schema migration, gallery flag,
private link, delivery record, or storage object was created or changed during
this implementation.
