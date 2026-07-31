-- Phase 2 durable, fail-closed media ingestion and processing pipeline.

BEGIN;

CREATE TYPE "MediaStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'DELETING');
CREATE TYPE "ArchiveStatus" AS ENUM ('NONE', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "MediaUploadKind" AS ENUM ('GALLERY_ASSET', 'GALLERY_ARCHIVE');
CREATE TYPE "MediaUploadStatus" AS ENUM ('CREATED', 'UPLOADED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'EXPIRED');
CREATE TYPE "MediaJobType" AS ENUM ('INGEST_IMAGE', 'REBUILD_IMAGE', 'VERIFY_ARCHIVE');
CREATE TYPE "MediaJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'FAILED');

ALTER TABLE "Gallery"
  ADD COLUMN "archiveStorageArea" "StorageArea" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "archiveStatus" "ArchiveStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "archiveContentHash" TEXT,
  ADD COLUMN "archiveSizeBytes" BIGINT,
  ADD COLUMN "archiveFailureReason" TEXT;

UPDATE "Gallery"
SET
  "archiveStatus" = 'READY',
  "archiveStorageArea" = CASE
    WHEN "visibility" = 'PUBLIC' THEN 'PUBLIC'::"StorageArea"
    ELSE 'PRIVATE'::"StorageArea"
  END
WHERE "archiveObjectKey" IS NOT NULL;

ALTER TABLE "GalleryAsset"
  ADD COLUMN "sourceStorageArea" "StorageArea" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "largeStorageKey" TEXT,
  ADD COLUMN "largeWidth" INTEGER,
  ADD COLUMN "largeHeight" INTEGER,
  ADD COLUMN "largeSizeBytes" BIGINT,
  ADD COLUMN "status" "MediaStatus" NOT NULL DEFAULT 'UPLOADING',
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "placeholderDataUrl" TEXT,
  ADD COLUMN "sourceVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "readyAt" TIMESTAMP(3),
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "processingAttempts" INTEGER NOT NULL DEFAULT 0;

-- Preserve the actual location of legacy originals until each asset is rebuilt.
UPDATE "GalleryAsset" AS asset
SET "sourceStorageArea" = CASE
  WHEN gallery."visibility" = 'PUBLIC' THEN 'PUBLIC'::"StorageArea"
  ELSE 'PRIVATE'::"StorageArea"
END
FROM "Gallery" AS gallery
WHERE gallery."id" = asset."galleryId";

UPDATE "GalleryAsset"
SET
  "status" = CASE
    WHEN "smallStorageKey" IS NOT NULL AND "mediumStorageKey" IS NOT NULL THEN 'READY'::"MediaStatus"
    ELSE 'FAILED'::"MediaStatus"
  END,
  "readyAt" = CASE
    WHEN "smallStorageKey" IS NOT NULL AND "mediumStorageKey" IS NOT NULL THEN CURRENT_TIMESTAMP
    ELSE NULL
  END,
  "failureReason" = CASE
    WHEN "smallStorageKey" IS NULL OR "mediumStorageKey" IS NULL THEN 'legacy_derivatives_missing'
    ELSE NULL
  END;

CREATE UNIQUE INDEX "GalleryAsset_largeStorageKey_key" ON "GalleryAsset"("largeStorageKey");
CREATE INDEX "GalleryAsset_galleryId_status_sortOrder_idx" ON "GalleryAsset"("galleryId", "status", "sortOrder");

CREATE TABLE "MediaUploadSession" (
  "id" TEXT NOT NULL,
  "galleryId" TEXT NOT NULL,
  "kind" "MediaUploadKind" NOT NULL,
  "status" "MediaUploadStatus" NOT NULL DEFAULT 'CREATED',
  "storageArea" "StorageArea" NOT NULL,
  "quarantineObjectKey" TEXT NOT NULL,
  "reservedAssetId" TEXT,
  "originalFilename" TEXT NOT NULL,
  "expectedContentType" TEXT NOT NULL,
  "expectedSizeBytes" BIGINT NOT NULL,
  "expectedSha256" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "uploadedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaUploadSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaProcessingJob" (
  "id" TEXT NOT NULL,
  "type" "MediaJobType" NOT NULL,
  "status" "MediaJobStatus" NOT NULL DEFAULT 'PENDING',
  "uploadSessionId" TEXT,
  "assetId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaProcessingJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaUploadSession_quarantineObjectKey_key" ON "MediaUploadSession"("quarantineObjectKey");
CREATE UNIQUE INDEX "MediaUploadSession_reservedAssetId_key" ON "MediaUploadSession"("reservedAssetId");
CREATE INDEX "MediaUploadSession_galleryId_status_createdAt_idx" ON "MediaUploadSession"("galleryId", "status", "createdAt");
CREATE INDEX "MediaUploadSession_status_expiresAt_idx" ON "MediaUploadSession"("status", "expiresAt");
CREATE UNIQUE INDEX "MediaProcessingJob_uploadSessionId_key" ON "MediaProcessingJob"("uploadSessionId");
CREATE INDEX "MediaProcessingJob_status_availableAt_createdAt_idx" ON "MediaProcessingJob"("status", "availableAt", "createdAt");
CREATE INDEX "MediaProcessingJob_assetId_status_idx" ON "MediaProcessingJob"("assetId", "status");

ALTER TABLE "MediaUploadSession"
  ADD CONSTRAINT "MediaUploadSession_galleryId_fkey"
  FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaProcessingJob"
  ADD CONSTRAINT "MediaProcessingJob_uploadSessionId_fkey"
  FOREIGN KEY ("uploadSessionId") REFERENCES "MediaUploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaProcessingJob"
  ADD CONSTRAINT "MediaProcessingJob_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "GalleryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
