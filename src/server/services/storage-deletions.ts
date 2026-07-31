import "server-only";

import { StorageDeletionStatus, type Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/db";
import { deleteObjectByKey, type StorageArea } from "@/server/services/storage";

export type StorageDeletionTarget = {
  area: StorageArea;
  objectKey: string;
};

function uniqueTargets(targets: StorageDeletionTarget[]): StorageDeletionTarget[] {
  const seen = new Set<string>();

  return targets.filter((target) => {
    const identity = `${target.area}:${target.objectKey}`;

    if (!target.objectKey || seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
}

export async function enqueueStorageDeletions(
  transaction: Prisma.TransactionClient,
  targets: StorageDeletionTarget[],
): Promise<void> {
  const normalizedTargets = uniqueTargets(targets);

  if (normalizedTargets.length === 0) {
    return;
  }

  await transaction.storageDeletionJob.createMany({
    data: normalizedTargets.map((target) => ({
      storageArea: target.area,
      objectKey: target.objectKey,
    })),
    skipDuplicates: true,
  });
}

function safeErrorLabel(error: unknown): string {
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name.slice(0, 120);
  }

  return "StorageDeletionFailed";
}

export async function attemptStorageDeletions(targets: StorageDeletionTarget[]): Promise<void> {
  const normalizedTargets = uniqueTargets(targets);

  await Promise.allSettled(
    normalizedTargets.map(async (target) => {
      try {
        await deleteObjectByKey(target.objectKey, target.area);
        await prisma.storageDeletionJob.updateMany({
          where: {
            storageArea: target.area,
            objectKey: target.objectKey,
          },
          data: {
            status: StorageDeletionStatus.COMPLETED,
            attempts: { increment: 1 },
            lastError: null,
            completedAt: new Date(),
          },
        }).catch(() => undefined);
      } catch (error) {
        await prisma.storageDeletionJob.updateMany({
          where: {
            storageArea: target.area,
            objectKey: target.objectKey,
          },
          data: {
            status: StorageDeletionStatus.PENDING,
            attempts: { increment: 1 },
            lastError: safeErrorLabel(error),
          },
        }).catch(() => undefined);
      }
    }),
  );
}

export async function retryPendingStorageDeletions(limit = 50): Promise<number> {
  const jobs = await prisma.storageDeletionJob.findMany({
    where: { status: StorageDeletionStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 200)),
    select: {
      storageArea: true,
      objectKey: true,
    },
  });

  await attemptStorageDeletions(
    jobs.map((job) => ({
      area: job.storageArea,
      objectKey: job.objectKey,
    })),
  );

  return jobs.length;
}
