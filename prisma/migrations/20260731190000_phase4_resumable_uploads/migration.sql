-- Phase 4 stores only server-side multipart coordination data. Browser
-- checkpoints contain hashes and opaque session IDs, never storage keys.
ALTER TYPE "MediaUploadStatus" ADD VALUE IF NOT EXISTS 'ABORTED';

ALTER TABLE "MediaUploadSession"
  ADD COLUMN "multipartUploadId" TEXT,
  ADD COLUMN "multipartPartSizeBytes" INTEGER,
  ADD COLUMN "multipartStartedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "MediaUploadSession_multipartUploadId_key"
  ON "MediaUploadSession"("multipartUploadId");
