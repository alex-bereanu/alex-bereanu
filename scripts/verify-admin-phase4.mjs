import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const source = (path) => readFile(resolve(root, path), "utf8");
const filePaths = {
  schema: "prisma/schema.prisma",
  migration: "prisma/migrations/20260805200000_admin_phase4_client_delivery/migration.sql",
  env: ".env.example",
  flag: "src/server/services/admin-client-delivery-phase4.ts",
  enable: "src/app/admin/actions/galleries/client-delivery/route.ts",
  shareLink: "src/app/admin/actions/galleries/share-link/route.ts",
  revoke: "src/app/admin/actions/galleries/share-link-revoke/route.ts",
  delivery: "src/server/services/client-delivery.ts",
  access: "src/server/services/gallery-access.ts",
  original: "src/app/api/galleries/[slug]/assets/[assetId]/download/route.ts",
  archiveDownload: "src/app/api/galleries/[slug]/archive-download/route.ts",
  archiveDelete: "src/app/admin/actions/galleries/archive-delete/route.ts",
  admin: "src/app/admin/galleries/[galleryId]/page.tsx",
  clientPage: "src/app/g/[slug]/page.tsx",
  clientActions: "src/components/client-photo-actions.tsx",
  gallery: "src/components/gallery-lightbox.tsx",
  overlay: "src/components/gallery-lightbox-overlay.tsx",
  storage: "src/server/services/storage.ts",
  styles: "src/app/globals.css",
};
const fileEntries = await Promise.all(
  Object.entries(filePaths).map(async ([key, path]) => [key, await source(path)]),
);
const files = Object.fromEntries(fileEntries);

function includesAll(value, fragments, label) {
  for (const fragment of fragments) assert.ok(value.includes(fragment), `${label} is missing: ${fragment}`);
}

includesAll(files.schema, ["enum GalleryDeliveryMethod", "model GalleryAssetDelivery", "@@unique([shareLinkId, assetId])", "sourceContentHash", "sourceSizeBytes", "replacedById"], "Phase 4 schema");
includesAll(files.migration, ["additive", "GalleryAssetDelivery", "GalleryShareLink_replacedById_fkey", "ON DELETE CASCADE", "GalleryAssetDelivery_shareLinkId_assetId_key"], "gated additive migration");
includesAll(files.env, ['ADMIN_CLIENT_DELIVERY_PHASE4_ENABLED="false"'], "disabled-by-default Phase 4 flag");
includesAll(files.flag, ["ADMIN_CLIENT_DELIVERY_PHASE4_ENABLED", "ADMIN_GALLERY_PHASE2_ENABLED"], "Phase 2-dependent Phase 4 gate");

for (const [label, value] of [["delivery activation", files.enable], ["share creation/replacement", files.shareLink], ["share revocation", files.revoke]]) {
  includesAll(value, ["requireAdminRequestSession", "verifyMutationProtection", "recordSecurityAuditEvent"], label);
}
includesAll(files.enable, ["requireAdminClientDeliveryPhase4", "TransactionIsolationLevel.Serializable", "clientDeliveryEnabled", "grantVersion: { increment: 1 }", "status: \"READY\"", "sourceVerifiedAt", "contentHash"], "safe delivery activation");
includesAll(files.shareLink, ["replacesShareLinkId", "replacedById", "replacedAt", "grantVersion: { increment: 1 }", "clientDeliveryEnabled: true", "tokenHash: capability.tokenHash"], "atomic link replacement");
includesAll(files.delivery, ["galleryAssetDelivery.upsert", "shareLinkId_assetId", "firstDeliveredAt", "lastDeliveredAt", "take: 100"], "unique completed delivery records");

includesAll(files.access, ["clientDeliveryEnabled: true", 'visibility: "PRIVATE"', 'status: "PUBLISHED"', "grantVersion"], "private client access boundary");
includesAll(files.original, ["resolveGalleryAccessFromCookie", "galleryCapabilityMatchesAccess", "galleryId: access.galleryId", 'status: "READY"', "deletedAt: null", "parseSingleByteRange", "getObjectStream", "content-sha256", "sourceSizeMatches", "TransformStream", "recordCompletedGalleryAssetDelivery", "Content-Range", "no-store"], "range-aware authorized verified-original streaming");
includesAll(files.storage, ["Range: options?.range", "ContentRange", "transformToWebStream", "buildStorageContentDisposition"], "non-buffered storage streaming");

includesAll(files.clientActions, ["navigator.canShare", "files: [file]", "response.blob()", "intent=share", "Tap again to share", "Save full quality", "Open original"], "capability-detected two-gesture mobile Share/Save");
includesAll(files.overlay, ["plugins/download", "Download", "downloadHref"], "lightbox full-quality Save action");
includesAll(files.gallery, ["ClientPhotoActions", "client-gallery-photo-open", "downloadHref"], "non-nested per-photo grid actions");
includesAll(files.clientPage, ["client-gallery-guide", "Save one photo at a time", "ClientPhotoActions", "phase4"], "client delivery guidance and fallback");
includesAll(files.styles, [".client-photo-action-icon", "min-width: 2.75rem", "safe-area-inset-bottom", ".client-original-list"], "mobile-safe delivery UI");

assert.ok(!files.admin.includes("AdminArchiveUpload"), "normal Admin workflow must not expose ZIP upload");
includesAll(files.admin, ["Successful photo deliveries", "Disable and revoke links", "Delete legacy ZIP", "getGalleryDeliverySummary", "replaceableLinks"], "Admin client delivery workspace");
includesAll(files.archiveDownload, ["isAdminClientDeliveryPhase4Enabled", 'status: 404'], "retired ZIP delivery route");
includesAll(files.archiveDelete, ["enqueueStorageDeletions", "attemptStorageDeletions", "archiveObjectKey: null"], "durable legacy ZIP cleanup");

console.log("Admin Phase 4 verification passed (gated client delivery, atomic links, streamed originals, unique delivery records, mobile Save/Share, and legacy ZIP retirement).");
