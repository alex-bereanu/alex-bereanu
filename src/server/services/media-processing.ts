import "server-only";

import { createHash } from "node:crypto";

import {
  MediaJobStatus,
  MediaJobType,
  MediaStatus,
  MediaUploadStatus,
  type MediaProcessingJob,
  type MediaUploadSession,
} from "@/generated/prisma/client";
import sharp, { type Metadata } from "sharp";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXEL_COUNT } from "@/lib/upload-limits";
import { validateImageFileSignature } from "@/server/security/upload-validation";
import {
  copyObject,
  createSignedDownloadUrl,
  getObjectBuffer,
  getStorageAreaForGalleryVisibility,
  headObject,
  uploadObject,
  type StorageArea,
} from "@/server/services/storage";
import {
  attemptStorageDeletions,
  enqueueStorageDeletions,
  type StorageDeletionTarget,
} from "@/server/services/storage-deletions";

const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_BATCH_SIZE = 10;
const IMAGE_VARIANT_VERSION = "v2";
const IMAGE_FORMAT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
const VARIANTS = [
  { name: "small", maxSize: 800, quality: 82 },
  { name: "medium", maxSize: 1440, quality: 84 },
  { name: "large", maxSize: 2560, quality: 86 },
] as const;

const scannerResponseSchema = z.object({
  clean: z.boolean(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().max(160).optional(),
});

class MediaProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "MediaProcessingError";
  }
}

type ClaimedJob = MediaProcessingJob & {
  uploadSession: MediaUploadSession | null;
};

type GeneratedVariant = {
  objectKey: string;
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: bigint;
};

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function safeErrorCode(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof MediaProcessingError) {
    return { code: error.code, retryable: error.retryable };
  }

  return { code: "media_processing_transient_failure", retryable: true };
}

function storageAreaForValue(value: string): StorageArea {
  if (value === "PUBLIC" || value === "PRIVATE") {
    return value;
  }

  throw new MediaProcessingError("invalid_storage_area", false);
}

async function verifySessionObject(session: MediaUploadSession): Promise<Buffer> {
  const area = storageAreaForValue(session.storageArea);
  const object = await headObject(session.quarantineObjectKey, area);

  if (
    object.contentLength === null ||
    BigInt(object.contentLength) !== session.expectedSizeBytes ||
    object.contentType?.toLowerCase() !== session.expectedContentType ||
    object.metadata["upload-session-id"] !== session.id ||
    object.metadata["expected-sha256"] !== session.expectedSha256
  ) {
    throw new MediaProcessingError("upload_object_metadata_mismatch", false);
  }

  const buffer = await getObjectBuffer(session.quarantineObjectKey, area);

  if (BigInt(buffer.byteLength) !== session.expectedSizeBytes || sha256(buffer) !== session.expectedSha256) {
    throw new MediaProcessingError("upload_object_checksum_mismatch", false);
  }

  return buffer;
}

function orientedDimensions(metadata: Metadata): { width: number; height: number } {
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const swapsAxes = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
  return swapsAxes ? { width: height, height: width } : { width, height };
}

async function inspectImage(buffer: Buffer, contentType: string): Promise<{ width: number; height: number }> {
  const signatureError = validateImageFileSignature(buffer, contentType);

  if (signatureError) {
    throw new MediaProcessingError("image_signature_mismatch", false);
  }

  let metadata: Metadata;

  try {
    metadata = await sharp(buffer, {
      animated: false,
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXEL_COUNT,
    }).metadata();
  } catch {
    throw new MediaProcessingError("image_decode_rejected", false);
  }

  const { width, height } = orientedDimensions(metadata);

  if (
    !width ||
    !height ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXEL_COUNT ||
    (metadata.pages ?? 1) > 1
  ) {
    throw new MediaProcessingError("image_dimensions_or_animation_rejected", false);
  }

  return { width, height };
}

async function generateImageOutputs(input: {
  buffer: Buffer;
  area: StorageArea;
  galleryId: string;
  assetId: string;
  contentHash: string;
}) {
  const prefix = `galleries/${input.area.toLowerCase()}/${input.galleryId}/derivatives/${input.assetId}`;
  const variants: Array<[(typeof VARIANTS)[number]["name"], GeneratedVariant]> = [];

  // Keep decoding work sequential inside a job. Multiple Sharp pipelines over a
  // large source can otherwise multiply peak memory while the queue is concurrent.
  for (const variant of VARIANTS) {
      const { data, info } = await sharp(input.buffer, {
        animated: false,
        failOn: "warning",
        limitInputPixels: MAX_IMAGE_PIXEL_COUNT,
      })
        .rotate()
        .resize({ width: variant.maxSize, height: variant.maxSize, fit: "inside", withoutEnlargement: true })
        .webp({ quality: variant.quality, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      const objectKey = `${prefix}/${input.contentHash.slice(0, 20)}-${IMAGE_VARIANT_VERSION}-${variant.maxSize}-q${variant.quality}.webp`;

      variants.push([
        variant.name,
        {
          objectKey,
          buffer: data,
          width: info.width,
          height: info.height,
          sizeBytes: BigInt(info.size),
        },
      ]);
  }
  const placeholder = await sharp(input.buffer, {
    animated: false,
    failOn: "warning",
    limitInputPixels: MAX_IMAGE_PIXEL_COUNT,
  })
    .rotate()
    .resize({ width: 24, height: 24, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 28, effort: 3 })
    .toBuffer();

  return {
    variants: Object.fromEntries(variants) as Record<(typeof VARIANTS)[number]["name"], GeneratedVariant>,
    placeholderDataUrl: `data:image/webp;base64,${placeholder.toString("base64")}`,
  };
}

async function uploadGeneratedVariants(
  variants: Record<(typeof VARIANTS)[number]["name"], GeneratedVariant>,
  area: StorageArea,
): Promise<void> {
  await Promise.all(
    Object.values(variants).map((variant) =>
      uploadObject({
        area,
        objectKey: variant.objectKey,
        contentType: "image/webp",
        body: variant.buffer,
        metadata: {
          "source-format": "verified",
          "metadata-stripped": "true",
          "variant-version": IMAGE_VARIANT_VERSION,
        },
      }),
    ),
  );
}

async function processImageIngest(job: ClaimedJob): Promise<void> {
  const session = job.uploadSession;

  if (!session || !session.reservedAssetId || session.kind !== "GALLERY_ASSET") {
    throw new MediaProcessingError("image_upload_session_missing", false);
  }

  const buffer = await verifySessionObject(session);
  const dimensions = await inspectImage(buffer, session.expectedContentType);
  const area = storageAreaForValue(session.storageArea);
  const sourceArea: StorageArea = "PRIVATE";
  const extension = IMAGE_FORMAT_BY_MIME[session.expectedContentType];

  if (!extension) {
    throw new MediaProcessingError("unsupported_verified_image_type", false);
  }

  const finalOriginalKey = `sources/galleries/${session.galleryId}/${session.reservedAssetId}/${session.expectedSha256}.${extension}`;
  const outputs = await generateImageOutputs({
    buffer,
    area,
    galleryId: session.galleryId,
    assetId: session.reservedAssetId,
    contentHash: session.expectedSha256,
  });

  await Promise.all([
    uploadObject({
      area: sourceArea,
      objectKey: finalOriginalKey,
      contentType: session.expectedContentType,
      body: buffer,
      metadata: { "content-sha256": session.expectedSha256, verified: "true" },
    }),
    uploadGeneratedVariants(outputs.variants, area),
  ]);

  const quarantineTarget: StorageDeletionTarget = { area, objectKey: session.quarantineObjectKey };
  await prisma.$transaction(async (transaction) => {
    const maxSort = await transaction.galleryAsset.findFirst({
      where: { galleryId: session.galleryId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    await transaction.galleryAsset.upsert({
      where: { id: session.reservedAssetId! },
      create: {
        id: session.reservedAssetId!,
        galleryId: session.galleryId,
        storageKey: finalOriginalKey,
        sourceStorageArea: sourceArea,
        originalFilename: session.originalFilename,
        mimeType: session.expectedContentType,
        fileExtension: extension,
        sizeBytes: session.expectedSizeBytes,
        width: dimensions.width,
        height: dimensions.height,
        sortOrder: (maxSort?.sortOrder ?? -1) + 1,
        status: MediaStatus.READY,
        contentHash: session.expectedSha256,
        placeholderDataUrl: outputs.placeholderDataUrl,
        sourceVerifiedAt: new Date(),
        readyAt: new Date(),
        processingAttempts: job.attempts,
        smallStorageKey: outputs.variants.small.objectKey,
        smallWidth: outputs.variants.small.width,
        smallHeight: outputs.variants.small.height,
        smallSizeBytes: outputs.variants.small.sizeBytes,
        mediumStorageKey: outputs.variants.medium.objectKey,
        mediumWidth: outputs.variants.medium.width,
        mediumHeight: outputs.variants.medium.height,
        mediumSizeBytes: outputs.variants.medium.sizeBytes,
        largeStorageKey: outputs.variants.large.objectKey,
        largeWidth: outputs.variants.large.width,
        largeHeight: outputs.variants.large.height,
        largeSizeBytes: outputs.variants.large.sizeBytes,
      },
      update: {
        status: MediaStatus.READY,
        failureReason: null,
        readyAt: new Date(),
      },
      select: { id: true },
    });
    await transaction.mediaUploadSession.update({
      where: { id: session.id },
      data: { status: MediaUploadStatus.COMPLETED, completedAt: new Date(), failureReason: null },
    });
    await transaction.mediaProcessingJob.update({
      where: { id: job.id },
      data: {
        status: MediaJobStatus.COMPLETED,
        assetId: session.reservedAssetId,
        completedAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });
    await enqueueStorageDeletions(transaction, [quarantineTarget]);
  });
  await attemptStorageDeletions([quarantineTarget]);
}

async function processImageRebuild(job: ClaimedJob): Promise<void> {
  if (!job.assetId) {
    throw new MediaProcessingError("rebuild_asset_missing", false);
  }

  const asset = await prisma.galleryAsset.findUnique({
    where: { id: job.assetId },
    include: { gallery: { select: { id: true, visibility: true } } },
  });

  if (!asset) {
    throw new MediaProcessingError("rebuild_asset_not_found", false);
  }

  const area = getStorageAreaForGalleryVisibility(asset.gallery.visibility);
  const sourceArea = storageAreaForValue(asset.sourceStorageArea);
  await prisma.galleryAsset.update({
    where: { id: asset.id },
    data: { status: MediaStatus.PROCESSING, failureReason: null },
    select: { id: true },
  });
  const buffer = await getObjectBuffer(asset.storageKey, sourceArea);
  const contentHash = sha256(buffer);
  const dimensions = await inspectImage(buffer, asset.mimeType);
  const extension = IMAGE_FORMAT_BY_MIME[asset.mimeType];

  if (!extension) {
    throw new MediaProcessingError("unsupported_verified_image_type", false);
  }

  const finalOriginalKey = `sources/galleries/${asset.galleryId}/${asset.id}/${contentHash}.${extension}`;
  const outputs = await generateImageOutputs({ buffer, area, galleryId: asset.galleryId, assetId: asset.id, contentHash });
  await Promise.all([
    asset.storageKey === finalOriginalKey && sourceArea === "PRIVATE"
      ? Promise.resolve()
      : uploadObject({
          area: "PRIVATE",
          objectKey: finalOriginalKey,
          contentType: asset.mimeType,
          body: buffer,
          metadata: { "content-sha256": contentHash, verified: "true" },
        }),
    uploadGeneratedVariants(outputs.variants, area),
  ]);

  const oldTargets: StorageDeletionTarget[] = [];
  if (asset.storageKey !== finalOriginalKey || sourceArea !== "PRIVATE") {
    oldTargets.push({ area: sourceArea, objectKey: asset.storageKey });
  }
  for (const objectKey of [asset.smallStorageKey, asset.mediumStorageKey, asset.largeStorageKey]) {
    if (objectKey && !Object.values(outputs.variants).some((variant) => variant.objectKey === objectKey)) {
      oldTargets.push({ area, objectKey });
    }
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.galleryAsset.update({
      where: { id: asset.id },
      data: {
        storageKey: finalOriginalKey,
        sourceStorageArea: "PRIVATE",
        status: MediaStatus.READY,
        contentHash,
        placeholderDataUrl: outputs.placeholderDataUrl,
        sourceVerifiedAt: new Date(),
        readyAt: new Date(),
        failureReason: null,
        processingAttempts: { increment: 1 },
        width: dimensions.width,
        height: dimensions.height,
        sizeBytes: BigInt(buffer.byteLength),
        smallStorageKey: outputs.variants.small.objectKey,
        smallWidth: outputs.variants.small.width,
        smallHeight: outputs.variants.small.height,
        smallSizeBytes: outputs.variants.small.sizeBytes,
        mediumStorageKey: outputs.variants.medium.objectKey,
        mediumWidth: outputs.variants.medium.width,
        mediumHeight: outputs.variants.medium.height,
        mediumSizeBytes: outputs.variants.medium.sizeBytes,
        largeStorageKey: outputs.variants.large.objectKey,
        largeWidth: outputs.variants.large.width,
        largeHeight: outputs.variants.large.height,
        largeSizeBytes: outputs.variants.large.sizeBytes,
      },
      select: { id: true },
    });
    await transaction.mediaProcessingJob.update({
      where: { id: job.id },
      data: { status: MediaJobStatus.COMPLETED, completedAt: new Date(), lockedAt: null, lastError: null },
    });
    await enqueueStorageDeletions(transaction, oldTargets);
  });
  await attemptStorageDeletions(oldTargets);
}

async function scanArchive(session: MediaUploadSession): Promise<void> {
  if (!env.MEDIA_SCANNER_URL || !env.MEDIA_SCANNER_SECRET) {
    throw new MediaProcessingError("archive_scanner_not_configured", false);
  }

  const area = storageAreaForValue(session.storageArea);
  const object = await headObject(session.quarantineObjectKey, area);

  if (
    object.contentLength === null ||
    BigInt(object.contentLength) !== session.expectedSizeBytes ||
    object.contentType?.toLowerCase() !== session.expectedContentType ||
    object.metadata["upload-session-id"] !== session.id ||
    object.metadata["expected-sha256"] !== session.expectedSha256
  ) {
    throw new MediaProcessingError("archive_object_metadata_mismatch", false);
  }

  const downloadUrl = await createSignedDownloadUrl({
    area,
    objectKey: session.quarantineObjectKey,
    expiresInSeconds: 5 * 60,
  });
  const response = await fetch(env.MEDIA_SCANNER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MEDIA_SCANNER_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      downloadUrl,
      expectedSha256: session.expectedSha256,
      expectedSizeBytes: session.expectedSizeBytes.toString(),
      filename: session.originalFilename,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  const payload = scannerResponseSchema.safeParse(await response.json().catch(() => null));

  if (!response.ok || !payload.success) {
    throw new MediaProcessingError("archive_scanner_unavailable", true);
  }

  if (!payload.data.clean || payload.data.sha256 !== session.expectedSha256) {
    throw new MediaProcessingError("archive_scan_or_checksum_rejected", false);
  }
}

async function processArchive(job: ClaimedJob): Promise<void> {
  const session = job.uploadSession;

  if (!session || session.kind !== "GALLERY_ARCHIVE") {
    throw new MediaProcessingError("archive_upload_session_missing", false);
  }

  await scanArchive(session);
  const area = storageAreaForValue(session.storageArea);
  const finalKey = `galleries/${area.toLowerCase()}/${session.galleryId}/archives/${session.expectedSha256}.zip`;
  const currentGallery = await prisma.gallery.findUnique({
    where: { id: session.galleryId },
    select: { archiveObjectKey: true, archiveStorageArea: true },
  });

  if (!currentGallery) {
    throw new MediaProcessingError("archive_gallery_not_found", false);
  }

  await copyObject({
    area,
    sourceObjectKey: session.quarantineObjectKey,
    destinationObjectKey: finalKey,
    contentType: "application/zip",
    metadata: { "content-sha256": session.expectedSha256, "malware-scan": "clean" },
  });

  const deletionTargets: StorageDeletionTarget[] = [{ area, objectKey: session.quarantineObjectKey }];
  if (currentGallery.archiveObjectKey && currentGallery.archiveObjectKey !== finalKey) {
    deletionTargets.push({
      area: currentGallery.archiveStorageArea,
      objectKey: currentGallery.archiveObjectKey,
    });
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.gallery.update({
      where: { id: session.galleryId },
      data: {
        archiveObjectKey: finalKey,
        archiveStorageArea: area,
        archiveFilename: session.originalFilename,
        archiveUploadedAt: new Date(),
        archiveStatus: "READY",
        archiveContentHash: session.expectedSha256,
        archiveSizeBytes: session.expectedSizeBytes,
        archiveFailureReason: null,
      },
      select: { id: true },
    });
    await transaction.mediaUploadSession.update({
      where: { id: session.id },
      data: { status: MediaUploadStatus.COMPLETED, completedAt: new Date(), failureReason: null },
    });
    await transaction.mediaProcessingJob.update({
      where: { id: job.id },
      data: { status: MediaJobStatus.COMPLETED, completedAt: new Date(), lockedAt: null, lastError: null },
    });
    await enqueueStorageDeletions(transaction, deletionTargets);
  });
  await attemptStorageDeletions(deletionTargets);
}

async function claimNextJob(): Promise<ClaimedJob | null> {
  const staleLock = new Date(Date.now() - LOCK_TIMEOUT_MS);

  return prisma.$transaction(async (transaction) => {
    await transaction.mediaProcessingJob.updateMany({
      where: { status: MediaJobStatus.PROCESSING, lockedAt: { lt: staleLock } },
      data: { status: MediaJobStatus.RETRY, lockedAt: null, availableAt: new Date() },
    });
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "MediaProcessingJob"
      WHERE "status" IN ('PENDING', 'RETRY')
        AND "availableAt" <= CURRENT_TIMESTAMP
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const id = rows[0]?.id;

    if (!id) {
      return null;
    }

    await transaction.mediaProcessingJob.update({
      where: { id },
      data: { status: MediaJobStatus.PROCESSING, lockedAt: new Date(), attempts: { increment: 1 } },
    });
    await transaction.mediaUploadSession.updateMany({
      where: { processingJob: { id } },
      data: { status: MediaUploadStatus.PROCESSING, failureReason: null },
    });

    return transaction.mediaProcessingJob.findUnique({
      where: { id },
      include: { uploadSession: true },
    });
  });
}

async function recordJobFailure(job: ClaimedJob, error: unknown): Promise<void> {
  const failure = safeErrorCode(error);
  const terminal = !failure.retryable || job.attempts >= job.maxAttempts;
  const retryDelayMs = Math.min(30 * 60 * 1000, 30_000 * 2 ** Math.max(0, job.attempts - 1));

  await prisma.$transaction(async (transaction) => {
    await transaction.mediaProcessingJob.update({
      where: { id: job.id },
      data: {
        status: terminal ? MediaJobStatus.FAILED : MediaJobStatus.RETRY,
        availableAt: terminal ? job.availableAt : new Date(Date.now() + retryDelayMs),
        lockedAt: null,
        lastError: failure.code,
      },
    });

    if (job.uploadSessionId) {
      await transaction.mediaUploadSession.update({
        where: { id: job.uploadSessionId },
        data: {
          status: terminal ? MediaUploadStatus.REJECTED : MediaUploadStatus.UPLOADED,
          failureReason: failure.code,
        },
      });
    }

    if (job.type === MediaJobType.REBUILD_IMAGE && job.assetId) {
      await transaction.galleryAsset.updateMany({
        where: { id: job.assetId },
        data: { status: terminal ? MediaStatus.FAILED : MediaStatus.PROCESSING, failureReason: failure.code },
      });
    }

    if (job.type === MediaJobType.VERIFY_ARCHIVE && job.uploadSession) {
      await transaction.gallery.updateMany({
        where: { id: job.uploadSession.galleryId },
        data: { archiveStatus: terminal ? "FAILED" : "PROCESSING", archiveFailureReason: failure.code },
      });
    }
  });
}

async function processClaimedJob(job: ClaimedJob): Promise<void> {
  if (job.type === MediaJobType.INGEST_IMAGE) {
    await processImageIngest(job);
    return;
  }

  if (job.type === MediaJobType.REBUILD_IMAGE) {
    await processImageRebuild(job);
    return;
  }

  if (job.type === MediaJobType.VERIFY_ARCHIVE) {
    await processArchive(job);
    return;
  }

  throw new MediaProcessingError("unknown_media_job_type", false);
}

export async function runMediaProcessingQueue(limit = 2): Promise<{ processed: number; failed: number }> {
  const boundedLimit = Math.max(1, Math.min(limit, MAX_BATCH_SIZE));
  let processed = 0;
  let failed = 0;

  for (let index = 0; index < boundedLimit; index += 1) {
    const job = await claimNextJob();

    if (!job) {
      break;
    }

    try {
      await processClaimedJob(job);
      processed += 1;
    } catch (error) {
      await recordJobFailure(job, error);
      failed += 1;
    }
  }

  return { processed, failed };
}

export async function retryMediaJob(jobId: string): Promise<boolean> {
  const result = await prisma.mediaProcessingJob.updateMany({
    where: { id: jobId, status: MediaJobStatus.FAILED },
    data: {
      status: MediaJobStatus.RETRY,
      attempts: 0,
      availableAt: new Date(),
      lockedAt: null,
      lastError: null,
      completedAt: null,
    },
  });
  return result.count > 0;
}

export async function enqueueAssetRebuilds(assetIds: string[]): Promise<number> {
  const assets = await prisma.galleryAsset.findMany({
    where: {
      id: { in: assetIds },
      ...(isAdminGalleryPhase2Enabled() ? { deletedAt: null } : {}),
      processingJobs: {
        none: { status: { in: [MediaJobStatus.PENDING, MediaJobStatus.PROCESSING, MediaJobStatus.RETRY] } },
      },
    },
    select: { id: true },
  });

  if (assets.length > 0) {
    await prisma.mediaProcessingJob.createMany({
      data: assets.map((asset) => ({ type: MediaJobType.REBUILD_IMAGE, assetId: asset.id })),
    });
  }

  return assets.length;
}
