-- Admin Phase 2 is additive and must only be applied after the Phase 0
-- backup/restore, direct-connection, staging, and authorization gates pass.

CREATE TYPE "GalleryStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE "Gallery"
  ADD COLUMN "status" "GalleryStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "clientDeliveryEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Gallery"
SET "status" = CASE WHEN "isActive" THEN 'PUBLISHED'::"GalleryStatus" ELSE 'DRAFT'::"GalleryStatus" END;

ALTER TABLE "GalleryAsset"
  ADD COLUMN "altText" TEXT,
  ADD COLUMN "caption" TEXT,
  ADD COLUMN "focalX" DOUBLE PRECISION,
  ADD COLUMN "focalY" DOUBLE PRECISION,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "purgeAfter" TIMESTAMP(3),
  ADD COLUMN "deletedByActorHash" TEXT;

ALTER TABLE "GalleryAsset"
  ADD CONSTRAINT "GalleryAsset_focalX_range" CHECK ("focalX" IS NULL OR ("focalX" >= 0 AND "focalX" <= 1)),
  ADD CONSTRAINT "GalleryAsset_focalY_range" CHECK ("focalY" IS NULL OR ("focalY" >= 0 AND "focalY" <= 1)),
  ADD CONSTRAINT "GalleryAsset_recycle_dates" CHECK (
    ("deletedAt" IS NULL AND "purgeAfter" IS NULL) OR
    ("deletedAt" IS NOT NULL AND "purgeAfter" IS NOT NULL AND "purgeAfter" >= "deletedAt")
  );

CREATE INDEX "Gallery_category_status_visibility_idx" ON "Gallery"("category", "status", "visibility");
CREATE INDEX "GalleryAsset_galleryId_deletedAt_sortOrder_idx" ON "GalleryAsset"("galleryId", "deletedAt", "sortOrder");
CREATE INDEX "GalleryAsset_deletedAt_purgeAfter_idx" ON "GalleryAsset"("deletedAt", "purgeAfter");
