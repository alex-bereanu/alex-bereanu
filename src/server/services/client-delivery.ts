import "server-only";

import { GalleryDeliveryMethod } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export type ClientDeliveryIntent = "download" | "share" | "view";

export function parseClientDeliveryIntent(value: string | null): ClientDeliveryIntent {
  return value === "share" || value === "view" ? value : "download";
}

function deliveryMethod(intent: ClientDeliveryIntent): GalleryDeliveryMethod {
  if (intent === "share") return GalleryDeliveryMethod.SHARE;
  if (intent === "view") return GalleryDeliveryMethod.ORIGINAL_VIEW;
  return GalleryDeliveryMethod.DOWNLOAD;
}

export async function recordCompletedGalleryAssetDelivery(input: {
  galleryId: string;
  assetId: string;
  shareLinkId: string;
  intent: ClientDeliveryIntent;
  sourceContentHash: string | null;
  sourceSizeBytes: bigint;
}): Promise<void> {
  const deliveredAt = new Date();
  await prisma.galleryAssetDelivery.upsert({
    where: { shareLinkId_assetId: { shareLinkId: input.shareLinkId, assetId: input.assetId } },
    create: {
      galleryId: input.galleryId,
      assetId: input.assetId,
      shareLinkId: input.shareLinkId,
      method: deliveryMethod(input.intent),
      sourceContentHash: input.sourceContentHash,
      sourceSizeBytes: input.sourceSizeBytes,
      firstDeliveredAt: deliveredAt,
      lastDeliveredAt: deliveredAt,
    },
    update: {
      method: deliveryMethod(input.intent),
      sourceContentHash: input.sourceContentHash,
      sourceSizeBytes: input.sourceSizeBytes,
      lastDeliveredAt: deliveredAt,
    },
  });
}

export async function getGalleryDeliverySummary(galleryId: string) {
  const [deliveredPhotoCount, recent] = await Promise.all([
    prisma.galleryAssetDelivery.count({ where: { galleryId } }),
    prisma.galleryAssetDelivery.findMany({
      where: { galleryId },
      orderBy: { lastDeliveredAt: "desc" },
      take: 100,
      select: {
        id: true,
        method: true,
        firstDeliveredAt: true,
        lastDeliveredAt: true,
        sourceContentHash: true,
        sourceSizeBytes: true,
        asset: { select: { originalFilename: true } },
        shareLink: { select: { recipientEmail: true, slug: true } },
      },
    }),
  ]);

  return { deliveredPhotoCount, recent };
}
