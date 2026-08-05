import "server-only";

import { randomUUID } from "node:crypto";
import { extname } from "node:path";

import { MediaJobType, MediaUploadKind, MediaUploadStatus } from "@/generated/prisma/client";

import { prisma } from "@/lib/db";
import {
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_UPLOAD_SESSION_MAX_AGE_MS,
  RESUMABLE_UPLOAD_SESSION_MAX_AGE_MS,
} from "@/lib/upload-limits";
import { sanitizeFilename } from "@/server/security/upload-validation";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  createSignedMultipartPartUrl,
  getStorageAreaForGalleryVisibility,
  listMultipartParts,
  type MultipartUploadedPart,
} from "@/server/services/storage";
import {
  attemptStorageDeletions,
  enqueueStorageDeletions,
  type StorageDeletionTarget,
} from "@/server/services/storage-deletions";

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export type UploadSessionDescriptor = {
  id: string;
  objectKey: string;
  storageArea: "PUBLIC" | "PRIVATE";
  contentType: string;
  filename: string;
  metadata: Record<string, string>;
};

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value);
}

export async function createGalleryUploadSession(input: {
  galleryId: string;
  kind: "GALLERY_ASSET" | "GALLERY_ARCHIVE";
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}): Promise<UploadSessionDescriptor | null> {
  if (!isSha256Hex(input.sha256)) {
    return null;
  }

  const gallery = await prisma.gallery.findUnique({
    where: { id: input.galleryId },
    select: { id: true, visibility: true },
  });

  if (!gallery) {
    return null;
  }
  if (isAdminGalleryPhase2Enabled()) {
    const lifecycle = await prisma.gallery.findUnique({ where: { id: gallery.id }, select: { status: true } });
    if (!lifecycle || lifecycle.status === "ARCHIVED") return null;
  }

  const sessionId = randomUUID();
  const storageArea =
    input.kind === "GALLERY_ARCHIVE" ? "PRIVATE" : getStorageAreaForGalleryVisibility(gallery.visibility);
  const filename = sanitizeFilename(input.filename) || (input.kind === "GALLERY_ARCHIVE" ? "gallery.zip" : "image");
  const extension = input.kind === "GALLERY_ARCHIVE" ? ".zip" : extname(filename).toLowerCase();
  const objectKey = `quarantine/${storageArea.toLowerCase()}/${gallery.id}/${sessionId}/${randomUUID()}${extension}`;
  const reservedAssetId = input.kind === "GALLERY_ASSET" ? randomUUID() : null;

  await prisma.mediaUploadSession.create({
    data: {
      id: sessionId,
      galleryId: gallery.id,
      kind: input.kind === "GALLERY_ASSET" ? MediaUploadKind.GALLERY_ASSET : MediaUploadKind.GALLERY_ARCHIVE,
      storageArea,
      quarantineObjectKey: objectKey,
      reservedAssetId,
      originalFilename: filename,
      expectedContentType: input.contentType.toLowerCase(),
      expectedSizeBytes: BigInt(input.sizeBytes),
      expectedSha256: input.sha256,
      expiresAt: new Date(
        Date.now() +
          (input.kind === "GALLERY_ARCHIVE"
            ? MULTIPART_UPLOAD_SESSION_MAX_AGE_MS
            : RESUMABLE_UPLOAD_SESSION_MAX_AGE_MS),
      ),
    },
  });

  return {
    id: sessionId,
    objectKey,
    storageArea,
    contentType: input.contentType.toLowerCase(),
    filename,
    metadata: {
      "upload-session-id": sessionId,
      "expected-sha256": input.sha256,
    },
  };
}

type ResumableSession = {
  id: string;
  galleryId: string;
  status: MediaUploadStatus;
  storageArea: "PUBLIC" | "PRIVATE";
  objectKey: string;
  contentType: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  multipartUploadId: string | null;
  multipartPartSizeBytes: number | null;
};

async function getOwnedResumableSession(input: {
  galleryId: string;
  uploadSessionId: string;
  kind: "GALLERY_ASSET" | "GALLERY_ARCHIVE";
  sha256?: string;
  sizeBytes?: number;
}): Promise<ResumableSession | null> {
  const session = await prisma.mediaUploadSession.findFirst({
    where: {
      id: input.uploadSessionId,
      galleryId: input.galleryId,
      kind: input.kind === "GALLERY_ASSET" ? MediaUploadKind.GALLERY_ASSET : MediaUploadKind.GALLERY_ARCHIVE,
      expiresAt: { gt: new Date() },
      status: { in: [MediaUploadStatus.CREATED, MediaUploadStatus.UPLOADED] },
      ...(input.sha256 ? { expectedSha256: input.sha256 } : {}),
      ...(input.sizeBytes !== undefined ? { expectedSizeBytes: BigInt(input.sizeBytes) } : {}),
    },
    select: {
      id: true,
      galleryId: true,
      status: true,
      storageArea: true,
      quarantineObjectKey: true,
      expectedContentType: true,
      originalFilename: true,
      expectedSizeBytes: true,
      expectedSha256: true,
      multipartUploadId: true,
      multipartPartSizeBytes: true,
    },
  });

  if (!session) return null;

  return {
    id: session.id,
    galleryId: session.galleryId,
    status: session.status,
    storageArea: session.storageArea,
    objectKey: session.quarantineObjectKey,
    contentType: session.expectedContentType,
    filename: session.originalFilename,
    sizeBytes: Number(session.expectedSizeBytes),
    sha256: session.expectedSha256,
    multipartUploadId: session.multipartUploadId,
    multipartPartSizeBytes: session.multipartPartSizeBytes,
  };
}

export async function getAssetUploadSessionForResume(input: {
  galleryId: string;
  uploadSessionId: string;
  sha256: string;
  sizeBytes: number;
}): Promise<ResumableSession | null> {
  return getOwnedResumableSession({ ...input, kind: "GALLERY_ASSET" });
}

export type MultipartResumeDescriptor = {
  uploadSessionId: string;
  partSizeBytes: number;
  totalParts: number;
  uploadedParts: MultipartUploadedPart[];
  alreadyUploaded: boolean;
};

export async function prepareArchiveMultipartUpload(input: {
  galleryId: string;
  uploadSessionId: string;
  sha256: string;
  sizeBytes: number;
}): Promise<MultipartResumeDescriptor | null> {
  let session = await getOwnedResumableSession({ ...input, kind: "GALLERY_ARCHIVE" });
  if (!session) return null;

  if (session.status === MediaUploadStatus.UPLOADED) {
    return {
      uploadSessionId: session.id,
      partSizeBytes: session.multipartPartSizeBytes ?? MULTIPART_PART_SIZE_BYTES,
      totalParts: Math.ceil(session.sizeBytes / (session.multipartPartSizeBytes ?? MULTIPART_PART_SIZE_BYTES)),
      uploadedParts: [],
      alreadyUploaded: true,
    };
  }

  if (!session.multipartUploadId) {
    const createdUploadId = await createMultipartUpload({
      area: session.storageArea,
      objectKey: session.objectKey,
      contentType: session.contentType,
      metadata: {
        "upload-session-id": session.id,
        "expected-sha256": session.sha256,
      },
    });
    const update = await prisma.mediaUploadSession.updateMany({
      where: { id: session.id, multipartUploadId: null, status: MediaUploadStatus.CREATED },
      data: {
        multipartUploadId: createdUploadId,
        multipartPartSizeBytes: MULTIPART_PART_SIZE_BYTES,
        multipartStartedAt: new Date(),
      },
    });

    if (update.count === 0) {
      await abortMultipartUpload({ area: session.storageArea, objectKey: session.objectKey, uploadId: createdUploadId });
    }

    session = await getOwnedResumableSession({ ...input, kind: "GALLERY_ARCHIVE" });
    if (!session?.multipartUploadId) return null;
  }

  const partSizeBytes = session.multipartPartSizeBytes ?? MULTIPART_PART_SIZE_BYTES;
  const uploadedParts = await listMultipartParts({
    area: session.storageArea,
    objectKey: session.objectKey,
    uploadId: session.multipartUploadId,
  });

  return {
    uploadSessionId: session.id,
    partSizeBytes,
    totalParts: Math.ceil(session.sizeBytes / partSizeBytes),
    uploadedParts,
    alreadyUploaded: false,
  };
}

export async function getArchiveMultipartPartUrl(input: {
  galleryId: string;
  uploadSessionId: string;
  partNumber: number;
}): Promise<string | null> {
  const session = await getOwnedResumableSession({ ...input, kind: "GALLERY_ARCHIVE" });
  if (!session?.multipartUploadId || session.status !== MediaUploadStatus.CREATED) return null;

  const partSizeBytes = session.multipartPartSizeBytes ?? MULTIPART_PART_SIZE_BYTES;
  const totalParts = Math.ceil(session.sizeBytes / partSizeBytes);
  if (!Number.isInteger(input.partNumber) || input.partNumber < 1 || input.partNumber > totalParts) return null;

  return createSignedMultipartPartUrl({
    area: session.storageArea,
    objectKey: session.objectKey,
    uploadId: session.multipartUploadId,
    partNumber: input.partNumber,
  });
}

export async function completeArchiveMultipartSession(input: {
  galleryId: string;
  uploadSessionId: string;
}): Promise<boolean> {
  const session = await getOwnedResumableSession({ ...input, kind: "GALLERY_ARCHIVE" });
  if (!session) return false;
  if (session.status === MediaUploadStatus.UPLOADED) return true;
  if (!session.multipartUploadId) return false;

  const partSizeBytes = session.multipartPartSizeBytes ?? MULTIPART_PART_SIZE_BYTES;
  const totalParts = Math.ceil(session.sizeBytes / partSizeBytes);
  const parts = await listMultipartParts({
    area: session.storageArea,
    objectKey: session.objectKey,
    uploadId: session.multipartUploadId,
  });

  if (parts.length !== totalParts) return false;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!;
    const expectedPartNumber = index + 1;
    const expectedSize = expectedPartNumber === totalParts
      ? session.sizeBytes - partSizeBytes * (totalParts - 1)
      : partSizeBytes;
    if (part.partNumber !== expectedPartNumber || part.sizeBytes !== expectedSize) return false;
  }

  await completeMultipartUpload({
    area: session.storageArea,
    objectKey: session.objectKey,
    uploadId: session.multipartUploadId,
    parts,
  });
  await prisma.mediaUploadSession.update({
    where: { id: session.id },
    data: { status: MediaUploadStatus.UPLOADED, uploadedAt: new Date() },
  });
  return true;
}

export async function abortArchiveMultipartSession(input: {
  galleryId: string;
  uploadSessionId: string;
}): Promise<boolean> {
  const session = await getOwnedResumableSession({ ...input, kind: "GALLERY_ARCHIVE" });
  if (!session) return false;

  if (session.multipartUploadId) {
    await abortMultipartUpload({
      area: session.storageArea,
      objectKey: session.objectKey,
      uploadId: session.multipartUploadId,
    });
  }
  await prisma.mediaUploadSession.update({
    where: { id: session.id },
    data: { status: MediaUploadStatus.ABORTED, failureReason: "upload_cancelled" },
  });
  return true;
}

export async function queueUploadedSessions(input: {
  galleryId: string;
  sessionIds: string[];
  kind: "GALLERY_ASSET" | "GALLERY_ARCHIVE";
}): Promise<number> {
  const kind = input.kind === "GALLERY_ASSET" ? MediaUploadKind.GALLERY_ASSET : MediaUploadKind.GALLERY_ARCHIVE;
  const jobType = input.kind === "GALLERY_ASSET" ? MediaJobType.INGEST_IMAGE : MediaJobType.VERIFY_ARCHIVE;
  const sessions = await prisma.mediaUploadSession.findMany({
    where: {
      id: { in: input.sessionIds },
      galleryId: input.galleryId,
      kind,
      status: { in: [MediaUploadStatus.CREATED, MediaUploadStatus.UPLOADED] },
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (sessions.length !== input.sessionIds.length) {
    throw new Error("upload_session_mismatch");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.mediaUploadSession.updateMany({
      where: { id: { in: sessions.map((session) => session.id) } },
      data: { status: MediaUploadStatus.UPLOADED, uploadedAt: new Date(), failureReason: null },
    });

    for (const session of sessions) {
      await transaction.mediaProcessingJob.upsert({
        where: { uploadSessionId: session.id },
        create: {
          type: jobType,
          uploadSessionId: session.id,
        },
        update: {
          status: "PENDING",
          availableAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
    }

    if (kind === MediaUploadKind.GALLERY_ARCHIVE) {
      await transaction.gallery.update({
        where: { id: input.galleryId },
        data: { archiveStatus: "PROCESSING", archiveFailureReason: null },
        select: { id: true },
      });
    }
  });

  return sessions.length;
}

export async function reconcileExpiredUploadSessions(limit = 100): Promise<number> {
  const sessions = await prisma.mediaUploadSession.findMany({
    where: {
      expiresAt: { lte: new Date() },
      OR: [
        { status: MediaUploadStatus.CREATED },
        { status: MediaUploadStatus.UPLOADED, processingJob: null },
      ],
    },
    orderBy: { expiresAt: "asc" },
    take: Math.max(1, Math.min(limit, 500)),
    select: { id: true, storageArea: true, quarantineObjectKey: true, multipartUploadId: true },
  });
  const deletionTargets: StorageDeletionTarget[] = sessions.map((session) => ({
    area: session.storageArea,
    objectKey: session.quarantineObjectKey,
  }));

  await Promise.allSettled(
    sessions.flatMap((session) =>
      session.multipartUploadId
        ? [
            abortMultipartUpload({
              area: session.storageArea,
              objectKey: session.quarantineObjectKey,
              uploadId: session.multipartUploadId,
            }),
          ]
        : [],
    ),
  );

  await prisma.$transaction(async (transaction) => {
    await enqueueStorageDeletions(transaction, deletionTargets);
    await transaction.mediaUploadSession.updateMany({
      where: { id: { in: sessions.map((session) => session.id) } },
      data: { status: MediaUploadStatus.EXPIRED, failureReason: "upload_session_expired" },
    });
  });
  await attemptStorageDeletions(deletionTargets);
  return sessions.length;
}
