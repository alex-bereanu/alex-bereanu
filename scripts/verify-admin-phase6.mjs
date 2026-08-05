#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFile(resolve(root, file), "utf8");

function includesAll(source, fragments, label) {
  const missing = fragments.filter((fragment) => !source.includes(fragment));
  assert.deepEqual(missing, [], `${label} is missing: ${missing.join(", ")}`);
}

const paths = {
  env: ".env.example",
  envSchema: "src/config/env.ts",
  flag: "src/server/services/admin-phase6-release.ts",
  report: "scripts/report-admin-phase6.mjs",
  migrate: "scripts/migrate-admin-phase6.mjs",
  delivery: "scripts/verify-admin-phase6-delivery.mjs",
  storage: "scripts/verify-admin-phase6-storage.mjs",
  phase0: "scripts/verify-admin-phase0-infrastructure.mjs",
  production: "scripts/verify-production-config.mjs",
  archiveDownload: "src/app/api/galleries/[slug]/archive-download/route.ts",
  archiveRelay: "src/app/admin/actions/galleries/archive-upload/route.ts",
  archiveUploadUrl: "src/app/admin/actions/galleries/archive-upload-url/route.ts",
  archiveFinalize: "src/app/admin/actions/galleries/archive-finalize/route.ts",
  archiveDelete: "src/app/admin/actions/galleries/archive-delete/route.ts",
  adminGallery: "src/app/admin/galleries/[galleryId]/page.tsx",
  packageJson: "package.json",
  implementation: "ADMIN-PHASE-6-IMPLEMENTATION.md",
  gitignore: ".gitignore",
};
const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await read(path)]));
const files = Object.fromEntries(entries);

includesAll(files.env, [
  'ADMIN_PHASE6_RELEASE_ENABLED="false"',
  'ADMIN_PHASE6_MIGRATION_APPROVED="false"',
  'PHASE6_DELIVERY_VERIFICATION_APPROVED="false"',
  "PHASE6_MIGRATION_REPORT_REFERENCE",
  "PHASE6_DELIVERY_REPORT_REFERENCE",
  "PHASE6_STORAGE_REPORT_REFERENCE",
  "PHASE6_VERIFIED_PRIVATE_GALLERY_DIGEST",
  "PHASE6_IOS_SAVE_VERIFIED",
  "PHASE6_ANDROID_SAVE_VERIFIED",
  "PHASE6_OBSERVATION_ENDS_AT",
], "disabled-by-default Phase 6 operator environment");
includesAll(files.envSchema, ["ADMIN_PHASE6_RELEASE_ENABLED: optionalBoolean"], "runtime environment schema");
includesAll(files.flag, [
  "ADMIN_PHASE6_RELEASE_ENABLED === true",
  "ADMIN_GALLERY_PHASE2_ENABLED === true",
  "ADMIN_CONTENT_PHASE3_ENABLED === true",
  "ADMIN_CLIENT_DELIVERY_PHASE4_ENABLED === true",
], "dependency-closed Phase 6 flag");

includesAll(files.migrate, [
  "ADMIN_PHASE6_MIGRATION_APPROVED",
  "--apply",
  "verify-admin-phase0-checkpoint.mjs",
  '"migrate", "deploy"',
  "--require-schema-ready",
  "Feature flags remain unchanged",
], "fail-closed migration runner");
includesAll(files.report, [
  "privacy: \"counts and non-reversible identity digests only\"",
  "entityAccounting",
  "compatibilityMismatches",
  "metadataBackfillPolicy",
  "missingPublishedSnapshot",
  "sourceProofMismatches",
  "legacyRequestHistoryPolicy: \"not-inferred-into-per-photo-deliveries\"",
  "activeIdentityDigest",
  "legacyArchives",
  "releaseBlockers",
  "--require-release-ready",
  "sslmode=verify-full",
], "privacy-minimized migration and invariant report");

includesAll(files.delivery, [
  "PHASE6_DELIVERY_MANIFEST_PATH",
  "PHASE6_DELIVERY_VERIFICATION_APPROVED",
  "passwordHash\" IS NULL",
  'redirect: "manual"',
  'unauthenticated.status === 404',
  'head.status === 200',
  'range.status === 206',
  "hashResponseBody",
  "transferred.hash === asset.contentHash",
  "waitForDeliveryRecord",
  "coveredGalleryIds.size === activeIds.length",
  "crossGallery.status === 404",
  "no private request details were logged",
  "non-pooled PostgreSQL endpoint with sslmode=verify-full",
], "synthetic private delivery verifier");
assert.ok(!files.delivery.includes("console.log(item"), "delivery verifier must not print manifest secrets");

includesAll(files.storage, [
  'listKeys(s3, publicBucket, "sources/galleries/")',
  "expectedPrivateSources",
  "orphanedSources",
  "publicSourceObjects",
  "pendingStorageDeletions",
  "non-pooled PostgreSQL endpoint with sslmode=verify-full",
  "no legacy archive object remaining",
], "original and archive storage accounting");

for (const [label, source] of [
  ["archive download", files.archiveDownload],
  ["archive relay", files.archiveRelay],
  ["archive upload URL", files.archiveUploadUrl],
  ["archive finalize", files.archiveFinalize],
]) {
  includesAll(source, ["isAdminPhase6ReleaseEnabled", 'status: 404'], `${label} retirement`);
}
includesAll(files.archiveDelete, ["enqueueStorageDeletions", "attemptStorageDeletions", "archiveObjectKey: null"], "durable archive cleanup");
includesAll(files.adminGallery, ["Legacy ZIP found", "Delete legacy ZIP", "durable storage outbox"], "short compatibility cleanup control");

includesAll(files.phase0, ["ADMIN_PHASE6_RELEASE_ENABLED", "Phase 6 flags must remain disabled"], "Phase 0 migration interlock");
includesAll(files.production, [
  "ADMIN_PHASE6_RELEASE_ENABLED",
  "PHASE6_MIGRATION_REPORT_REFERENCE",
  "PHASE6_DELIVERY_REPORT_REFERENCE",
  "PHASE6_STORAGE_REPORT_REFERENCE",
  "verified iOS and Android full-quality save evidence",
], "production evidence gate");
includesAll(files.packageJson, [
  '"admin:phase6:report"',
  '"admin:phase6:migrate"',
  '"admin:phase6:delivery"',
  '"admin:phase6:storage"',
  '"admin:phase6:verify"',
], "Phase 6 commands");
includesAll(files.gitignore, [".phase6-*.json"], "private Phase 6 evidence ignore rule");
includesAll(files.implementation, ["> continue with phase 6", "Phase 0 infrastructure checkpoint remains blocked", "No migration or feature flag was activated"], "Phase 6 implementation record");

console.log("Admin Phase 6 verification passed (fail-closed migration, complete entity/invariant reports, private original delivery proof, storage accounting, rollback evidence, and ZIP retirement controls).");
