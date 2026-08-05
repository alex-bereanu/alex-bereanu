import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

async function source(path) {
  return readFile(resolve(root, path), "utf8");
}

function includesAll(value, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(value.includes(fragment), `${label} is missing: ${fragment}`);
  }
}

const paths = {
  schema: "prisma/schema.prisma",
  migration: "prisma/migrations/20260804190000_admin_phase2_gallery_workflow/migration.sql",
  envExample: ".env.example",
  feature: "src/server/services/admin-gallery-phase2.ts",
  lifecycle: "src/app/admin/actions/galleries/lifecycle/route.ts",
  recycle: "src/server/services/gallery-recycle-bin.ts",
  restore: "src/app/admin/actions/galleries/assets-restore/route.ts",
  purge: "src/app/admin/actions/galleries/assets-purge/route.ts",
  metadata: "src/app/admin/actions/galleries/assets-metadata/route.ts",
  batch: "src/app/admin/actions/galleries/assets-batch/route.ts",
  publicGallery: "src/server/services/public-gallery.ts",
  privateGallery: "src/server/services/gallery-access.ts",
  originalDownload: "src/app/api/galleries/[slug]/assets/[assetId]/download/route.ts",
  maintenance: "src/server/services/operational-maintenance.ts",
  manager: "src/components/admin-asset-manager.tsx",
  recycleManager: "src/components/admin-recycle-bin.tsx",
  workspace: "src/app/admin/galleries/[galleryId]/page.tsx",
  preview: "src/app/admin/galleries/[galleryId]/preview/page.tsx",
};

const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await source(path)]));
const files = Object.fromEntries(entries);

includesAll(files.schema, [
  "enum GalleryStatus",
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
  "status               GalleryStatus     @default(PUBLISHED)",
  "clientDeliveryEnabled Boolean           @default(false)",
  "altText            String?",
  "caption            String?",
  "focalX             Float?",
  "focalY             Float?",
  "deletedAt          DateTime?",
  "purgeAfter         DateTime?",
], "Phase 2 Prisma schema");

includesAll(files.migration, [
  "CREATE TYPE \"GalleryStatus\"",
  "DEFAULT 'PUBLISHED'",
  "UPDATE \"Gallery\"",
  "WHEN \"isActive\" THEN 'PUBLISHED'",
  "GalleryAsset_focalX_range",
  "GalleryAsset_recycle_dates",
], "additive Phase 2 migration");

includesAll(files.envExample, [
  'DIRECT_DATABASE_URL="postgresql://USER:PASSWORD@DIRECT_HOST/DB?sslmode=verify-full"',
  'ADMIN_GALLERY_PHASE2_ENABLED="false"',
  'GALLERY_RECYCLE_RETENTION_DAYS="30"',
], "disabled-by-default Phase 2 configuration");

includesAll(files.feature, [
  "env.ADMIN_GALLERY_PHASE2_ENABLED === true",
  "DEFAULT_GALLERY_RECYCLE_RETENTION_DAYS = 30",
  "Math.min",
  "365",
], "Phase 2 feature boundary");

for (const key of ["lifecycle", "restore", "purge", "metadata", "batch"]) {
  assert.ok(/require(?:Recent)?AdminRequestSession|requireAdminRequestSessionDetails/.test(files[key]), `${key} mutation is missing an Admin session guard`);
  includesAll(files[key], [
    "verifyMutationProtection",
    "isAdminGalleryPhase2Enabled",
    "recordSecurityAuditEvent",
  ], `${key} mutation`);
}

includesAll(files.lifecycle, [
  'status: "READY"',
  '"UPLOADING", "PROCESSING", "FAILED", "DELETING"',
  "isActive: parsed.status === GalleryStatus.PUBLISHED",
  "grantVersion: { increment: 1 }",
], "gallery publication lifecycle");

includesAll(files.recycle, [
  "getGalleryRecycleRetentionDays()",
  "deletedAt",
  "purgeAfter",
  "deletedByActorHash",
  "enqueueStorageDeletions",
  "attemptStorageDeletions",
  "purgeExpiredGalleryAssets",
  "take: Math.max(1, Math.min(limit, 100))",
], "recoverable deletion service");

includesAll(files.purge, ['confirmation: z.literal("PURGE")', "purgeGalleryAsset"], "explicit purge action");
includesAll(files.metadata, ["altText", "caption", "focalX", "focalY", "capturedAt"], "photo metadata action");
includesAll(files.batch, [
  '.max(100)',
  'z.enum(["RECYCLE", "RETRY", "MOVE"])',
  "source.visibility !== target.visibility",
  'target.status === "ARCHIVED"',
], "bounded batch actions");

includesAll(files.publicGallery, [
  'isAdminGalleryPhase2Enabled() ? { deletedAt: null } : {}',
  'isAdminGalleryPhase2Enabled() ? { status: "PUBLISHED" } : { isActive: true }',
  'isAdminGalleryPhase2Enabled() ? { altText: true as const } : {}',
], "public gallery lifecycle and recycle filtering");
includesAll(files.privateGallery, [
  'isAdminGalleryPhase2Enabled() ? { status: "PUBLISHED" as const } : { isActive: true }',
  'isAdminGalleryPhase2Enabled() ? { deletedAt: null } : {}',
  'isAdminGalleryPhase2Enabled() ? { altText: true as const } : {}',
], "private gallery lifecycle and recycle filtering");
includesAll(files.originalDownload, [
  "isAdminGalleryPhase2Enabled()",
  "deletedAt: null",
  'status: "READY"',
], "authorized original exclusion policy");

includesAll(files.maintenance, ["purgeExpiredGalleryAssets(50)", "purgedGalleryAssets"], "scheduled recycle purge");
includesAll(files.manager, [
  "admin-asset-grid",
  '<option value="RECYCLE">',
  '<option value="RETRY">',
  '<option value="MOVE">',
  "Save metadata",
  ">Earlier</button>",
  ">Later</button>",
], "responsive photo manager");
includesAll(files.recycleManager, ["Recycle Bin", "Restore", "Permanently purge", 'confirmation !== "PURGE"'], "Recycle Bin UI");
includesAll(files.workspace, ["Publishing requires at least one ready photo", "Recycle Bin", "Preview gallery", "AdminAssetManager"], "gallery workspace");
includesAll(files.preview, ["requireAdminPageSession", "GalleryLightbox", "robots"], "authenticated gallery preview");

console.log("Admin Phase 2 static verification passed (gated migration, lifecycle, photo workflow, Recycle Bin, previews, and public/private exclusion rules).");
