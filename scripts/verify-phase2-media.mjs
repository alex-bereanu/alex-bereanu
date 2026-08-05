import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const source = (path) => readFile(resolve(root, path), "utf8");

function includesAll(value, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(value.includes(fragment), `${label} is missing: ${fragment}`);
  }
}

const [
  schema,
  migration,
  sessions,
  processing,
  assetFinalize,
  archiveFinalize,
  worker,
  internalAuth,
  privateMedia,
  galleryAccess,
  publicGallery,
  assetDelete,
  galleryDelete,
  backfill,
  siteContentUpdate,
  imageVariants,
] = await Promise.all([
  source("prisma/schema.prisma"),
  source("prisma/migrations/20260731140000_phase2_media_pipeline/migration.sql"),
  source("src/server/services/media-upload-sessions.ts"),
  source("src/server/services/media-processing.ts"),
  source("src/app/admin/actions/galleries/assets-finalize/route.ts"),
  source("src/app/admin/actions/galleries/archive-finalize/route.ts"),
  source("src/app/api/internal/media-worker/route.ts"),
  source("src/server/security/internal-auth.ts"),
  source("src/app/api/gallery-media/assets/[assetId]/[variant]/route.ts"),
  source("src/server/services/gallery-access.ts"),
  source("src/server/services/public-gallery.ts"),
  source("src/app/admin/actions/galleries/assets-delete/route.ts"),
  source("src/app/admin/actions/galleries/delete/route.ts"),
  source("scripts/backfill-image-variants.mjs"),
  source("src/app/admin/actions/site-content/update/route.ts"),
  source("src/server/services/image-variants.ts"),
]);

includesAll(schema, ["enum MediaStatus", "model MediaUploadSession", "model MediaProcessingJob", "sourceStorageArea", "archiveStorageArea", "largeStorageKey", "placeholderDataUrl"], "media schema");
includesAll(migration, ["CREATE TABLE \"MediaUploadSession\"", "CREATE TABLE \"MediaProcessingJob\"", "legacy_derivatives_missing"], "media migration");
includesAll(sessions, ["quarantine/", "expectedSha256", "UPLOAD_SESSION_MAX_AGE_MS", "enqueueStorageDeletions"], "upload sessions");
includesAll(processing, ["FOR UPDATE SKIP LOCKED", "headObject", "failOn: \"warning\"", "MAX_IMAGE_PIXEL_COUNT", 'sourceArea: StorageArea = "PRIVATE"', 'IMAGE_VARIANT_VERSION = "v2"', '{ name: "small", maxSize: 800, quality: 82 }', '{ name: "medium", maxSize: 1440, quality: 84 }', '{ name: "large", maxSize: 2560, quality: 86 }', '"variant-version": IMAGE_VARIANT_VERSION', '"metadata-stripped": "true"', "VERIFY_ARCHIVE", "scannerResponseSchema", "MediaStatus.READY"], "durable processing");
includesAll(assetFinalize, ["uploadSessionIds", "queueUploadedSessions", "after("], "asset finalization");
includesAll(archiveFinalize, ["uploadSessionId", "queueUploadedSessions", "after("], "archive finalization");
includesAll(worker, ["isInternalRequestAuthorized", "runMediaProcessingQueue", "reconcileExpiredUploadSessions"], "worker authentication");
includesAll(internalAuth, ["MEDIA_WORKER_SECRET", "CRON_SECRET", "timingSafeEqual"], "internal credential verification");
includesAll(privateMedia, ['status: "READY"', 'variant !== "large"', 'getObjectStream(objectKey, "PRIVATE")'], "private delivery");
includesAll(galleryAccess, ['status: "READY" as const', "availablePrivateAssetWhere", "archiveStatus === \"READY\"", "largeStorageKey"], "private gallery publication gate");
includesAll(publicGallery, ['status: "READY"', "largeSrc", "placeholderDataUrl"], "public gallery publication gate");
includesAll(assetDelete, ["largeStorageKey", "enqueueStorageDeletions"], "asset deletion coverage");
includesAll(galleryDelete, ["quarantineObjectKey", "largeStorageKey", "enqueueStorageDeletions"], "gallery deletion coverage");
includesAll(backfill, ["DRY RUN", "--execute", "--rebuild-ready", "targetVariantMarker", "READY V1 REBUILD", "REBUILD_IMAGE", "processingJobs"], "controlled backfill");
includesAll(siteContentUpdate, ["prepareSiteContentImageVariants", "preparedImage?.small.objectKey", "preparedImage?.medium.objectKey"], "site-content publication gate");
includesAll(imageVariants, ["MAX_IMAGE_PIXEL_COUNT", 'failOn: "warning"', "prepareSiteContentImageVariants", "Promise.allSettled"], "site-content derivatives");

assert.ok(!assetFinalize.includes("storageKey:"), "asset finalization must not trust a client storage key");
assert.ok(!archiveFinalize.includes("objectKey:"), "archive finalization must not trust a client object key");

console.log("Phase 2 media verification passed (quarantine, durable jobs, READY gates, archive scanning, deletion, and backfill controls).\n");
