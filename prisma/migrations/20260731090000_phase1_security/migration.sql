-- Phase 1 security cutover.
-- Existing share URLs are deliberately deactivated because their capability
-- values were stored in plaintext. Administrators must create replacement
-- links after deployment; new links store only a SHA-256 token hash.

BEGIN;

CREATE TYPE "StorageArea" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "StorageDeletionStatus" AS ENUM ('PENDING', 'COMPLETED');

CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GalleryShareLink"
    ADD COLUMN "tokenHash" TEXT,
    ADD COLUMN "grantVersion" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "revokedAt" TIMESTAMP(3),
    ADD COLUMN "lastAccessedAt" TIMESTAMP(3);

UPDATE "GalleryShareLink"
SET
    "isActive" = FALSE,
    "revokedAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "tokenHash" IS NULL;

CREATE TABLE "StorageDeletionJob" (
    "id" TEXT NOT NULL,
    "storageArea" "StorageArea" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "status" "StorageDeletionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageDeletionJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE INDEX "AdminSession_subject_revokedAt_idx" ON "AdminSession"("subject", "revokedAt");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
CREATE UNIQUE INDEX "GalleryShareLink_tokenHash_key" ON "GalleryShareLink"("tokenHash");
CREATE UNIQUE INDEX "StorageDeletionJob_storageArea_objectKey_key" ON "StorageDeletionJob"("storageArea", "objectKey");
CREATE INDEX "StorageDeletionJob_status_createdAt_idx" ON "StorageDeletionJob"("status", "createdAt");

COMMIT;
