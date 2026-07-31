import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import {
  attemptStorageDeletions,
  enqueueStorageDeletions,
  type StorageDeletionTarget,
} from "@/server/services/storage-deletions";

const deleteArchiveSchema = z.object({
  galleryId: z.string().trim().min(1),
});

function redirectToAdmin(request: Request, query: string): NextResponse {
  const url = new URL(`/admin/galleries?view=expanded&${query}`, request.url);
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

    const parsed = deleteArchiveSchema.parse({
      galleryId: formData.get("galleryId"),
    });

    const gallery = await prisma.gallery.findUnique({
      where: { id: parsed.galleryId },
      select: {
        id: true,
        archiveObjectKey: true,
        archiveStorageArea: true,
      },
    });

    if (!gallery) {
      return redirectToAdmin(request, "error=gallery_not_found");
    }

    const deletionTargets: StorageDeletionTarget[] = gallery.archiveObjectKey
      ? [
          {
            area: gallery.archiveStorageArea,
            objectKey: gallery.archiveObjectKey,
          },
        ]
      : [];

    await prisma.$transaction(async (transaction) => {
      await enqueueStorageDeletions(transaction, deletionTargets);
      await transaction.gallery.update({
        where: { id: gallery.id },
        data: {
          archiveObjectKey: null,
          archiveFilename: null,
          archiveUploadedAt: null,
          archiveStatus: "NONE",
          archiveContentHash: null,
          archiveSizeBytes: null,
          archiveFailureReason: null,
        },
      });
    });
    await attemptStorageDeletions(deletionTargets);

    return redirectToAdmin(request, "notice=archive_deleted");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToAdmin(request, "error=invalid_archive_delete_payload");
    }

    return redirectToAdmin(request, "error=archive_delete_failed");
  }
}
