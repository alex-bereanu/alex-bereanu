import { GalleryCategory, GalleryVisibility } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { toSlug } from "@/lib/slug";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { invalidatePublicGalleryCache } from "@/server/services/public-cache";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";

const updateGallerySchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  category: z.nativeEnum(GalleryCategory),
  visibility: z.nativeEnum(GalleryVisibility),
  isActive: z.boolean(),
});

function redirectToGallery(request: Request, galleryId: string | undefined, query: string): NextResponse {
  const path = galleryId ? `/admin/galleries/${galleryId}?tab=details&${query}` : `/admin/galleries?${query}`;
  const url = new URL(path, request.url);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (!env.DATABASE_URL) {
    return redirectToGallery(request, undefined, "error=database_not_configured");
  }

  try {
    const phase2 = isAdminGalleryPhase2Enabled();
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));

    if (securityError) {
      return securityError;
    }

    const parsed = updateGallerySchema.parse({
      id: formData.get("id"),
      title: formData.get("title"),
      slug: toSlug(String(formData.get("slug") ?? "")),
      description: String(formData.get("description") ?? "").trim() || undefined,
      category: formData.get("category"),
      visibility: formData.get("visibility"),
      isActive: String(formData.get("isActive") ?? "") === "on",
    });

    const currentGallery = await prisma.gallery.findUnique({
      where: { id: parsed.id },
      select: {
        visibility: true,
        archiveObjectKey: true,
        _count: { select: { assets: true } },
        uploadSessions: {
          where: {
            status: { notIn: ["COMPLETED", "EXPIRED"] },
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!currentGallery) {
      return redirectToGallery(request, parsed.id, "error=gallery_not_found");
    }

    const visibilityChanges = currentGallery.visibility !== parsed.visibility;

    if (
      visibilityChanges &&
      (currentGallery._count.assets > 0 || currentGallery.archiveObjectKey || currentGallery.uploadSessions.length > 0)
    ) {
      return redirectToGallery(request, parsed.id, "error=gallery_visibility_storage_migration_required");
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.gallery.update({
        where: { id: parsed.id },
        data: {
          title: parsed.title,
          slug: parsed.slug,
          description: parsed.description,
          category: parsed.category,
          visibility: parsed.visibility,
          ...(phase2 ? {} : { isActive: parsed.isActive }),
        },
        select: { id: true },
      });

      if (parsed.visibility !== "PRIVATE") {
        await transaction.galleryShareLink.updateMany({
          where: { galleryId: parsed.id, isActive: true },
          data: {
            isActive: false,
            revokedAt: new Date(),
            grantVersion: { increment: 1 },
          },
        });
      }
    });

    invalidatePublicGalleryCache();
    await recordSecurityAuditEvent({ eventType: "gallery.details.update", outcome: "SUCCESS", clientIp: getClientIp(request), resourceType: "gallery", resourceId: parsed.id, metadata: { category: parsed.category, visibility: parsed.visibility } });
    return redirectToGallery(request, parsed.id, "notice=gallery_updated");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToGallery(request, undefined, "error=invalid_gallery_payload");
    }

    return redirectToGallery(request, undefined, "error=gallery_update_failed");
  }
}
