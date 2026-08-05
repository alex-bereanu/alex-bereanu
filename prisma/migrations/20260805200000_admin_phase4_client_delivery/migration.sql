-- Admin Phase 4 is additive and must only be applied after the Phase 0
-- infrastructure checkpoint and Phase 2 migration pass in isolated staging.

CREATE TYPE "GalleryDeliveryMethod" AS ENUM ('DOWNLOAD', 'SHARE', 'ORIGINAL_VIEW');

ALTER TABLE "GalleryShareLink"
  ADD COLUMN "replacedAt" TIMESTAMP(3),
  ADD COLUMN "replacedById" TEXT;

CREATE TABLE "GalleryAssetDelivery" (
  "id" TEXT NOT NULL,
  "galleryId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "shareLinkId" TEXT NOT NULL,
  "method" "GalleryDeliveryMethod" NOT NULL,
  "sourceContentHash" TEXT,
  "sourceSizeBytes" BIGINT NOT NULL,
  "firstDeliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDeliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GalleryAssetDelivery_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GalleryShareLink"
  ADD CONSTRAINT "GalleryShareLink_replacedById_fkey"
  FOREIGN KEY ("replacedById") REFERENCES "GalleryShareLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GalleryAssetDelivery"
  ADD CONSTRAINT "GalleryAssetDelivery_galleryId_fkey"
  FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GalleryAssetDelivery_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "GalleryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GalleryAssetDelivery_shareLinkId_fkey"
  FOREIGN KEY ("shareLinkId") REFERENCES "GalleryShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "GalleryAssetDelivery_shareLinkId_assetId_key"
  ON "GalleryAssetDelivery"("shareLinkId", "assetId");
CREATE INDEX "GalleryAssetDelivery_galleryId_lastDeliveredAt_idx"
  ON "GalleryAssetDelivery"("galleryId", "lastDeliveredAt");
CREATE INDEX "GalleryAssetDelivery_assetId_lastDeliveredAt_idx"
  ON "GalleryAssetDelivery"("assetId", "lastDeliveredAt");
CREATE INDEX "GalleryShareLink_galleryId_replacedAt_idx"
  ON "GalleryShareLink"("galleryId", "replacedAt");
