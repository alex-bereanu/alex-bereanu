import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireRecentAdminRequestSession } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import {
  attemptStorageDeletions,
  enqueueStorageDeletions,
  type StorageDeletionTarget,
} from "@/server/services/storage-deletions";

const deleteArchiveSchema = z.object({
  galleryId: z.string().trim().min(1),
});

function redirectToGallery(request: Request, galleryId: string | undefined, query: string): NextResponse {
  const path = galleryId ? `/admin/galleries/${galleryId}?tab=downloads&${query}` : `/admin/galleries?${query}`;
  const url = new URL(path, request.url);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireRecentAdminRequestSession(request);
  if (auth.response) return auth.response;
  const clientIp = getClientIp(request);

  if (!env.DATABASE_URL) {
    return redirectToGallery(request, undefined, "error=database_not_configured");
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
      return redirectToGallery(request, parsed.galleryId, "error=gallery_not_found");
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
        select: { id: true },
      });
    });
    await attemptStorageDeletions(deletionTargets);
    await recordSecurityAuditEvent({
      eventType: "gallery.archive.delete",
      outcome: "SUCCESS",
      actor: auth.session.subject,
      clientIp,
      resourceType: "gallery",
      resourceId: parsed.galleryId,
      metadata: { storage_targets: deletionTargets.length },
    });

    return redirectToGallery(request, parsed.galleryId, "notice=archive_deleted");
  } catch (error) {
    if (error instanceof z.ZodError) {
      await recordSecurityAuditEvent({ eventType: "gallery.archive.delete", outcome: "DENIED", actor: auth.session.subject, clientIp, metadata: { reason: "invalid_payload" } });
      return redirectToGallery(request, undefined, "error=invalid_archive_delete_payload");
    }

    await recordSecurityAuditEvent({ eventType: "gallery.archive.delete", outcome: "ERROR", actor: auth.session.subject, clientIp, metadata: { reason: error instanceof Error ? error.name : "UnknownError" } });
    return redirectToGallery(request, undefined, "error=archive_delete_failed");
  }
}
