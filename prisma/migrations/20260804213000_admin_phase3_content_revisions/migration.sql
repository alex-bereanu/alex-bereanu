-- Admin Phase 3 is additive and must only be applied after the Phase 0
-- backup/restore, direct-connection, staging, and authorization gates pass.

CREATE TYPE "SiteContentRevisionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

ALTER TABLE "SiteContent"
  ADD COLUMN "imageFocalX" DOUBLE PRECISION,
  ADD COLUMN "imageFocalY" DOUBLE PRECISION,
  ADD COLUMN "seoTitle" TEXT,
  ADD COLUMN "seoDescription" TEXT,
  ADD COLUMN "publishedPayload" JSONB,
  ADD COLUMN "publishedRevisionId" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "publishedByActorHash" TEXT;

ALTER TABLE "SiteContent"
  ADD CONSTRAINT "SiteContent_imageFocalX_range" CHECK ("imageFocalX" IS NULL OR ("imageFocalX" >= 0 AND "imageFocalX" <= 1)),
  ADD CONSTRAINT "SiteContent_imageFocalY_range" CHECK ("imageFocalY" IS NULL OR ("imageFocalY" >= 0 AND "imageFocalY" <= 1));

CREATE TABLE "SiteContentRevision" (
  "id" TEXT NOT NULL,
  "contentKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "SiteContentRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  "payload" JSONB NOT NULL,
  "imageObjectKey" TEXT,
  "imageSmallObjectKey" TEXT,
  "imageSmallWidth" INTEGER,
  "imageSmallHeight" INTEGER,
  "imageSmallSizeBytes" BIGINT,
  "imageMediumObjectKey" TEXT,
  "imageMediumWidth" INTEGER,
  "imageMediumHeight" INTEGER,
  "imageMediumSizeBytes" BIGINT,
  "imageStorageArea" "StorageArea",
  "imageAlt" TEXT,
  "imageFocalX" DOUBLE PRECISION,
  "imageFocalY" DOUBLE PRECISION,
  "restoredFromRevisionId" TEXT,
  "createdByActorHash" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteContentRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SiteContentRevision_imageFocalX_range" CHECK ("imageFocalX" IS NULL OR ("imageFocalX" >= 0 AND "imageFocalX" <= 1)),
  CONSTRAINT "SiteContentRevision_imageFocalY_range" CHECK ("imageFocalY" IS NULL OR ("imageFocalY" >= 0 AND "imageFocalY" <= 1))
);

INSERT INTO "SiteContentRevision" (
  "id", "contentKey", "version", "status", "payload",
  "imageObjectKey", "imageSmallObjectKey", "imageSmallWidth", "imageSmallHeight", "imageSmallSizeBytes",
  "imageMediumObjectKey", "imageMediumWidth", "imageMediumHeight", "imageMediumSizeBytes",
  "imageStorageArea", "imageAlt", "publishedAt", "createdAt", "updatedAt"
)
SELECT
  'legacy-' || md5("key"), "key", 1, 'PUBLISHED'::"SiteContentRevisionStatus",
  jsonb_strip_nulls(jsonb_build_object(
    'title', "title", 'subtitle', "subtitle", 'body', "body",
    'ctaTitle', "ctaTitle", 'ctaBody', "ctaBody", 'imageAlt', "imageAlt"
  )),
  "imageObjectKey", "imageSmallObjectKey", "imageSmallWidth", "imageSmallHeight", "imageSmallSizeBytes",
  "imageMediumObjectKey", "imageMediumWidth", "imageMediumHeight", "imageMediumSizeBytes",
  CASE WHEN "imageObjectKey" IS NOT NULL OR "imageSmallObjectKey" IS NOT NULL OR "imageMediumObjectKey" IS NOT NULL THEN 'PUBLIC'::"StorageArea" ELSE NULL END,
  "imageAlt", "updatedAt", "createdAt", "updatedAt"
FROM "SiteContent";

UPDATE "SiteContent"
SET
  "publishedPayload" = jsonb_strip_nulls(jsonb_build_object(
    'title', "title", 'subtitle', "subtitle", 'body', "body",
    'ctaTitle', "ctaTitle", 'ctaBody', "ctaBody", 'imageAlt', "imageAlt"
  )),
  "publishedRevisionId" = 'legacy-' || md5("key"),
  "publishedAt" = "updatedAt";

CREATE UNIQUE INDEX "SiteContentRevision_contentKey_version_key" ON "SiteContentRevision"("contentKey", "version");
CREATE INDEX "SiteContentRevision_contentKey_status_updatedAt_idx" ON "SiteContentRevision"("contentKey", "status", "updatedAt");

ALTER TABLE "SiteContentRevision"
  ADD CONSTRAINT "SiteContentRevision_contentKey_fkey"
  FOREIGN KEY ("contentKey") REFERENCES "SiteContent"("key") ON DELETE CASCADE ON UPDATE CASCADE;
