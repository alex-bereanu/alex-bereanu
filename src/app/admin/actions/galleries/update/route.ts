import { GalleryCategory, GalleryVisibility } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { toSlug } from "@/lib/slug";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { invalidatePublicGalleryCache } from "@/server/services/public-cache";

const updateGallerySchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  category: z.nativeEnum(GalleryCategory),
  visibility: z.nativeEnum(GalleryVisibility),
  isActive: z.boolean(),
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
      return redirectToAdmin(request, "error=gallery_not_found");
    }

    const visibilityChanges = currentGallery.visibility !== parsed.visibility;

    if (
      visibilityChanges &&
      (currentGallery._count.assets > 0 || currentGallery.archiveObjectKey || currentGallery.uploadSessions.length > 0)
    ) {
      return redirectToAdmin(request, "error=gallery_visibility_storage_migration_required");
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
          isActive: parsed.isActive,
        },
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
    return redirectToAdmin(request, "notice=gallery_updated");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToAdmin(request, "error=invalid_gallery_payload");
    }

    return redirectToAdmin(request, "error=gallery_update_failed");
  }
}
