import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { getStorageAreaForGalleryVisibility } from "@/server/services/storage";
import { invalidatePublicGalleryCache } from "@/server/services/public-cache";
import {
  attemptStorageDeletions,
  enqueueStorageDeletions,
  type StorageDeletionTarget,
} from "@/server/services/storage-deletions";

const deleteGallerySchema = z.object({
  id: z.string().trim().min(1),
});

function redirectToAdmin(request: Request, query: string): NextResponse {
  const url = new URL(`/admin/galleries?${query}`, request.url);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (!env.DATABASE_URL) {
    return redirectToAdmin(request, "error=database_not_configured");
  }

  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));

    if (securityError) {
      return securityError;
    }

    const parsed = deleteGallerySchema.parse({ id: formData.get("id") });

    const gallery = await prisma.gallery.findUnique({
      where: { id: parsed.id },
      select: {
        archiveObjectKey: true,
        archiveStorageArea: true,
        visibility: true,
        assets: {
          select: {
            storageKey: true,
            sourceStorageArea: true,
            smallStorageKey: true,
            mediumStorageKey: true,
            largeStorageKey: true,
          },
        },
        uploadSessions: {
          where: {
            status: { notIn: ["COMPLETED", "EXPIRED"] },
          },
          select: {
            storageArea: true,
            quarantineObjectKey: true,
          },
        },
      },
    });

    if (!gallery) {
      return redirectToAdmin(request, "error=gallery_not_found");
    }

    const area = getStorageAreaForGalleryVisibility(gallery.visibility);
    const deletionTargets: StorageDeletionTarget[] = [
      ...gallery.assets.flatMap((asset) => [
        asset.smallStorageKey,
        asset.mediumStorageKey,
        asset.largeStorageKey,
      ]),
    ]
      .filter((objectKey): objectKey is string => Boolean(objectKey))
      .map((objectKey) => ({ area, objectKey }));
    if (gallery.archiveObjectKey) {
      deletionTargets.push({ area: gallery.archiveStorageArea, objectKey: gallery.archiveObjectKey });
    }
    deletionTargets.push(
      ...gallery.assets.map((asset) => ({ area: asset.sourceStorageArea, objectKey: asset.storageKey })),
    );
    deletionTargets.push(
      ...gallery.uploadSessions.map((session) => ({
        area: session.storageArea,
        objectKey: session.quarantineObjectKey,
      })),
    );

    await prisma.$transaction(async (transaction) => {
      await enqueueStorageDeletions(transaction, deletionTargets);
      await transaction.gallery.delete({ where: { id: parsed.id } });
    });
    await attemptStorageDeletions(deletionTargets);
    invalidatePublicGalleryCache();
    return redirectToAdmin(request, "notice=gallery_deleted");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToAdmin(request, "error=invalid_gallery_payload");
    }

    return redirectToAdmin(request, "error=gallery_delete_failed");
  }
}
