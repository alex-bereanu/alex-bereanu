# Admin Phase 6 — Migration and Release Implementation

## User prompt

> continue with phase 6

## Outcome

Phase 6 is implemented locally as a fail-closed migration and release package. It inventories every gallery, asset, share link, content record, content revision, delivery record, upload/job record, deletion job, and legacy archive using counts plus non-reversible identity digests. It also provides separate live gates for private-original storage and end-to-end client delivery.

No migration or feature flag was activated. The Phase 0 infrastructure checkpoint remains blocked because the required provider backup/restore, direct verified-TLS database, storage restore, synthetic authorization, and iOS/Android evidence have not been supplied. The current schema-compatible site therefore continues to run with Admin Phases 2–4 and Phase 6 disabled.

## Current pre-migration inventory

The privacy-minimized local inventory on 2026-08-05 found:

- 12 active public galleries and no private gallery currently exposed to clients.
- 1,076 READY gallery assets whose source area is private.
- Six inactive legacy share-link rows; none is currently active.
- Three existing site-content records.
- No legacy gallery ZIP metadata or archive object reference.
- No active upload sessions and no pending storage-deletion job.
- Only the four earlier media/security migrations are applied; the additive Admin Phase 2, Phase 3, and Phase 4 migrations remain unapplied.

This inventory is safe to print because it contains no record IDs, filenames, object keys, capabilities, cookies, email addresses, content, or connection strings.

## Implemented controls

### Fail-closed migration runner

`npm run admin:phase6:migrate` is a read-only dry run. Applying the additive migrations requires the explicit command and approval variable:

```powershell
$env:ADMIN_PHASE6_MIGRATION_APPROVED="true"
npm run admin:phase6:migrate -- --apply
```

The apply path refuses to run unless all Admin feature flags are false, `DIRECT_DATABASE_URL` is a non-pooled PostgreSQL endpoint with `sslmode=verify-full`, and the complete Phase 0 checkpoint passes immediately before `prisma migrate deploy`. After deployment it runs the schema/backfill invariant report. It never edits feature flags.

The existing additive SQL performs the truthful backfills:

- `isActive=true` becomes `PUBLISHED`; inactive galleries become `DRAFT` while the compatibility value remains synchronized.
- Asset caption, alt text, focal point, and recycle fields remain nullable. Phase 6 does not fabricate descriptive metadata.
- Every existing `SiteContent` row gets one published revision and a matching published snapshot.
- The per-photo delivery table starts empty. Legacy aggregate request counts are reported but never inferred as successful delivery of a particular photo.

### Migration and invariant report

`npm run admin:phase6:report` works before or after migration and reports blockers without changing state. Operators use:

```powershell
node scripts/report-admin-phase6.mjs --require-schema-ready
node scripts/report-admin-phase6.mjs --require-release-ready
```

The schema gate checks authorized database TLS, applied migrations, gallery lifecycle compatibility, private source metadata, READY derivative/source proof, recycle dates, cross-role object-key collisions, content revision coverage, and delivery/source consistency.

The release gate additionally requires zero legacy archive metadata, zero active archive jobs/sessions, an empty storage-deletion outbox, valid active private links, enabled Phase 2–4 flags, delivery and storage evidence references, active-private-gallery digest coverage, iOS and Android save evidence, and a live rollback observation window.

### End-to-end private delivery proof

`npm run admin:phase6:delivery` uses an ignored staging manifest containing exactly one passwordless synthetic or explicitly approved link/asset pair for every active private gallery:

```json
[
  {
    "capabilityToken": "REDACTED_43_CHARACTER_CAPABILITY",
    "assetId": "REDACTED_APPROVED_ASSET_ID"
  }
]
```

Never commit this manifest. Store it under an ignored `.phase6-*.json` filename, configure its path with `PHASE6_DELIVERY_MANIFEST_PATH`, and configure the HTTPS target with `PHASE6_STAGING_BASE_URL`. Because successful verification records staging access/delivery evidence, the command also requires the deliberate `PHASE6_DELIVERY_VERIFICATION_APPROVED=true` operator switch.

For each gallery, the verifier confirms unauthenticated denial, passwordless grant issuance, private/no-store HEAD metadata, a valid byte-range response, a complete streamed download whose size and SHA-256 match the approved database source, and the resulting per-photo delivery proof. It also performs a cross-gallery ownership denial. The emitted report contains only counts, the target origin, and the active-gallery identity digest.

Phone behavior still requires real-device checks. Record successful full-quality Share/Save behavior separately with `PHASE6_IOS_SAVE_VERIFIED=true` and `PHASE6_ANDROID_SAVE_VERIFIED=true`; automated HTTP transfer cannot prove that a mobile OS placed an image in Photos.

### Original-object and archive accounting

`npm run admin:phase6:storage` compares every database original with the full private `sources/galleries/` object inventory. It fails if an original is missing, orphaned, uses an invalid prefix, is marked public, or appears in the public bucket. It also requires all legacy archive references/objects and pending deletion jobs to be gone.

The legacy ZIP delete action remains available only as a cleanup escape hatch and uses the durable storage-deletion outbox. After the release gate reaches zero archives, `ADMIN_PHASE6_RELEASE_ENABLED=true` permanently returns 404 from archive relay, signed-upload, finalize, and download routes. The final flag is dependency-closed: it is effective only while Phase 2, Phase 3, and Phase 4 are also enabled.

## Staged release sequence

1. Complete `npm run admin:phase0:checkpoint` in isolated staging with verified provider evidence.
2. Deploy the schema-compatible build with all Admin flags false.
3. Set the one-time migration approval and run `npm run admin:phase6:migrate -- --apply` against the non-pooled direct database endpoint.
4. Enable Phase 2, Phase 3, and Phase 4 in staging; keep Phase 6 false.
5. Exercise gallery/content workflows and remove any legacy ZIP through the Admin cleanup control. Wait until the deletion outbox is empty.
6. Run the complete image migration/storage checks, `npm run admin:phase6:storage`, and `npm run admin:phase6:delivery` with approved staging data.
7. Verify full-quality Share/Save on real iOS and Android devices. Store evidence references outside the repository.
8. Set the migration, storage, delivery, mobile, gallery-digest, and observation-window variables; run the release-ready report.
9. Enable `ADMIN_PHASE6_RELEASE_ENABLED=true` for a small traffic cohort, then expand while watching authorization denials, integrity failures, storage errors, queue age, and mobile delivery outcomes.
10. Keep the previous deployment, feature-flag configuration, encrypted database backup, and storage recovery versions available through `PHASE6_OBSERVATION_ENDS_AT`.

## Rollback

During observation, first set `ADMIN_PHASE6_RELEASE_ENABLED=false`; this restores only the short compatibility boundary. If the new Admin workflow is unhealthy, also disable Phases 4, 3, and 2 in that order and route traffic to the previous compatible deployment. The migrations are additive and preserve `isActive`, legacy content columns, share-link counters, and archive metadata fields, so normal rollback does not require reversing schema.

Do not manually delete migration rows or run a destructive down migration. If data integrity itself is compromised, freeze writes/workers, restore the verified database and storage versions into isolation, reconcile the deletion ledger, validate authorization, and only then restore traffic.

## Local verification commands

```powershell
npm run admin:phase6:migrate
npm run admin:phase6:report
npm run admin:phase6:verify
npm run typecheck
npm run lint
npm run build
```

The delivery, storage, schema-ready, and release-ready commands are intentionally external gates and must remain blocked until their staging credentials/evidence and the Phase 0 checkpoint are available.
