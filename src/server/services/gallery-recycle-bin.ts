import "server-only";

import { createHmac } from "node:crypto";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { getGalleryRecycleRetentionDays, isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import { invalidatePublicGalleryCache } from "@/server/services/public-cache";
import { getStorageAreaForGalleryVisibility } from "@/server/services/storage";
import {
  attemptStorageDeletions,
  enqueueStorageDeletions,
  type StorageDeletionTarget,
} from "@/server/services/storage-deletions";

function actorHash(actor: string | null | undefined): string | null {
  const secret = env.AUDIT_LOG_SECRET ?? env.CSRF_SECRET;
  if (!secret || !actor) return null;
  return createHmac("sha256", secret).update(actor).digest("hex");
}

function uniqueIds(assetIds: string[]): string[] {
  return [...new Set(assetIds.filter(Boolean))].slice(0, 100);
}

export async function recycleGalleryAssets(input: {
  galleryId: string;
  assetIds: string[];
  actor?: string | null;
}): Promise<number> {
  if (!isAdminGalleryPhase2Enabled()) return 0;
  const ids = uniqueIds(input.assetIds);
  if (ids.length === 0) return 0;

  const deletedAt = new Date();
  const purgeAfter = new Date(deletedAt.getTime() + getGalleryRecycleRetentionDays() * 24 * 60 * 60 * 1000);
  const result = await prisma.galleryAsset.updateMany({
    where: { id: { in: ids }, galleryId: input.galleryId, deletedAt: null },
    data: { deletedAt, purgeAfter, deletedByActorHash: actorHash(input.actor) },
  });
  if (result.count > 0) invalidatePublicGalleryCache();
  return result.count;
}

export async function restoreGalleryAssets(input: { galleryId: string; assetIds: string[] }): Promise<number> {
  if (!isAdminGalleryPhase2Enabled()) return 0;
  const ids = uniqueIds(input.assetIds);
  if (ids.length === 0) return 0;

  const result = await prisma.galleryAsset.updateMany({
    where: { id: { in: ids }, galleryId: input.galleryId, deletedAt: { not: null } },
    data: { deletedAt: null, purgeAfter: null, deletedByActorHash: null },
  });
  if (result.count > 0) invalidatePublicGalleryCache();
  return result.count;
}

type PurgeCandidate = {
  id: string;
  galleryId: string;
  storageKey: string;
  sourceStorageArea: "PUBLIC" | "PRIVATE";
  smallStorageKey: string | null;
  mediumStorageKey: string | null;
  largeStorageKey: string | null;
  gallery: { visibility: "PUBLIC" | "PRIVATE" };
};

function deletionTargetsForAsset(asset: PurgeCandidate): StorageDeletionTarget[] {
  const derivativeArea = getStorageAreaForGalleryVisibility(asset.gallery.visibility);
  const targets = [asset.smallStorageKey, asset.mediumStorageKey, asset.largeStorageKey]
    .filter((key): key is string => Boolean(key))
    .map((objectKey) => ({ area: derivativeArea, objectKey }));
  targets.push({ area: asset.sourceStorageArea, objectKey: asset.storageKey });
  return targets;
}

async function purgeCandidate(asset: PurgeCandidate): Promise<boolean> {
  const targets = deletionTargetsForAsset(asset);
  const deleted = await prisma.$transaction(async (transaction) => {
    await enqueueStorageDeletions(transaction, targets);
    return transaction.galleryAsset.deleteMany({ where: { id: asset.id, deletedAt: { not: null } } });
  });
  if (deleted.count === 0) return false;
  await attemptStorageDeletions(targets);
  return true;
}

export async function purgeGalleryAsset(input: { galleryId: string; assetId: string }): Promise<boolean> {
  if (!isAdminGalleryPhase2Enabled()) return false;
  const asset = await prisma.galleryAsset.findFirst({
    where: { id: input.assetId, galleryId: input.galleryId, deletedAt: { not: null } },
    select: {
      id: true, galleryId: true, storageKey: true, sourceStorageArea: true,
      smallStorageKey: true, mediumStorageKey: true, largeStorageKey: true,
      gallery: { select: { visibility: true } },
    },
  });
  if (!asset) return false;
  const purged = await purgeCandidate(asset);
  if (purged) invalidatePublicGalleryCache();
  return purged;
}

export async function purgeExpiredGalleryAssets(limit = 50): Promise<number> {
  if (!isAdminGalleryPhase2Enabled()) return 0;
  const candidates = await prisma.galleryAsset.findMany({
    where: { deletedAt: { not: null }, purgeAfter: { lte: new Date() } },
    orderBy: { purgeAfter: "asc" },
    take: Math.max(1, Math.min(limit, 100)),
    select: {
      id: true, galleryId: true, storageKey: true, sourceStorageArea: true,
      smallStorageKey: true, mediumStorageKey: true, largeStorageKey: true,
      gallery: { select: { visibility: true } },
    },
  });
  const results = await Promise.allSettled(candidates.map((asset) => purgeCandidate(asset)));
  const purged = results.reduce((total, result) => total + (result.status === "fulfilled" && result.value ? 1 : 0), 0);
  if (purged > 0) invalidatePublicGalleryCache();
  return purged;
}
