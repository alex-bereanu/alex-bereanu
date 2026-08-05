import { GalleryStatus } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import { invalidatePublicGalleryCache } from "@/server/services/public-cache";

const schema = z.object({ galleryId: z.string().trim().min(1).max(200), status: z.nativeEnum(GalleryStatus) });

function redirectToGallery(request: Request, galleryId: string | undefined, query: string) {
  return NextResponse.redirect(new URL(galleryId ? `/admin/galleries/${galleryId}?tab=details&${query}` : `/admin/galleries?${query}`, request.url), 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;
  if (!env.DATABASE_URL) return redirectToGallery(request, undefined, "error=database_not_configured");
  if (!isAdminGalleryPhase2Enabled()) return redirectToGallery(request, undefined, "error=gallery_phase2_not_enabled");

  let galleryId: string | undefined;
  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));
    if (securityError) return securityError;
    const parsed = schema.parse({ galleryId: formData.get("galleryId"), status: formData.get("status") });
    galleryId = parsed.galleryId;

    const gallery = await prisma.gallery.findUnique({ where: { id: parsed.galleryId }, select: { id: true, status: true } });
    if (!gallery) return redirectToGallery(request, galleryId, "error=gallery_not_found");

    if (parsed.status === GalleryStatus.PUBLISHED) {
      const [ready, blocking] = await Promise.all([
        prisma.galleryAsset.count({ where: { galleryId, deletedAt: null, status: "READY" } }),
        prisma.galleryAsset.count({ where: { galleryId, deletedAt: null, status: { in: ["UPLOADING", "PROCESSING", "FAILED", "DELETING"] } } }),
      ]);
      if (ready === 0 || blocking > 0) {
        return redirectToGallery(request, galleryId, `error=${ready === 0 ? "gallery_publish_requires_photo" : "gallery_publish_blocked_media"}`);
      }
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.gallery.update({
        where: { id: galleryId },
        data: {
          status: parsed.status,
          isActive: parsed.status === GalleryStatus.PUBLISHED,
          ...(parsed.status !== GalleryStatus.PUBLISHED ? { clientDeliveryEnabled: false } : {}),
        },
        select: { id: true },
      });
      if (parsed.status !== GalleryStatus.PUBLISHED) {
        await transaction.galleryShareLink.updateMany({
          where: { galleryId, isActive: true },
          data: { isActive: false, revokedAt: new Date(), grantVersion: { increment: 1 } },
        });
      }
    });
    invalidatePublicGalleryCache();
    await recordSecurityAuditEvent({
      eventType: "gallery.lifecycle.update", outcome: "SUCCESS", clientIp: getClientIp(request),
      resourceType: "gallery", resourceId: galleryId, metadata: { from: gallery.status, to: parsed.status },
    });
    return redirectToGallery(request, galleryId, "notice=gallery_lifecycle_updated");
  } catch (error) {
    await recordSecurityAuditEvent({ eventType: "gallery.lifecycle.update", outcome: "ERROR", clientIp: getClientIp(request), resourceType: "gallery", resourceId: galleryId });
    return redirectToGallery(request, galleryId, `error=${error instanceof z.ZodError ? "invalid_gallery_lifecycle" : "gallery_lifecycle_failed"}`);
  }
}
