import { randomUUID } from "node:crypto";

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

const createGallerySchema = z.object({
  title: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  category: z.nativeEnum(GalleryCategory),
  visibility: z.nativeEnum(GalleryVisibility),
});

function redirectToCreate(request: Request, query: string): NextResponse {
  const url = new URL(`/admin/galleries/new?${query}`, request.url);
  return NextResponse.redirect(url, 303);
}

function resolveRedirectCategory(formData: FormData): string {
  const rawValue = String(formData.get("redirectCategory") ?? formData.get("category") ?? "").trim().toUpperCase();

  if (!Object.values(GalleryCategory).includes(rawValue as GalleryCategory)) {
    return "";
  }

  return `&createCategory=${rawValue}`;
}

async function createGallery(parsed: z.infer<typeof createGallerySchema>): Promise<{
  id: string;
  category: GalleryCategory;
  visibility: GalleryVisibility;
}> {
  if (isAdminGalleryPhase2Enabled()) {
    return prisma.gallery.create({
      data: {
        title: parsed.title,
        slug: parsed.slug,
        description: parsed.description,
        category: parsed.category,
        visibility: parsed.visibility,
        status: "DRAFT",
        isActive: false,
      },
      select: { id: true, category: true, visibility: true },
    });
  }

  // The generated client contains Phase 2 defaults that Prisma injects into
  // create statements even when Phase 2 has not been migrated. Name only the
  // legacy columns so gallery creation remains available before that rollout.
  const galleryId = randomUUID();
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    category: GalleryCategory;
    visibility: GalleryVisibility;
  }>>`
    INSERT INTO "Gallery" (
      "id", "title", "slug", "description", "category", "visibility", "updatedAt"
    )
    VALUES (
      ${galleryId},
      ${parsed.title},
      ${parsed.slug},
      ${parsed.description ?? null},
      ${parsed.category}::"GalleryCategory",
      ${parsed.visibility}::"GalleryVisibility",
      CURRENT_TIMESTAMP
    )
    RETURNING "id", "category", "visibility"
  `;

  const gallery = rows[0];
  if (!gallery) {
    throw new Error("gallery_create_returned_no_row");
  }

  return gallery;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (!env.DATABASE_URL) {
    return redirectToCreate(request, "error=database_not_configured");
  }

  const formData = await request.formData();
  const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));

  if (securityError) {
    return securityError;
  }

  const createCategoryQuery = resolveRedirectCategory(formData);

  try {
    const parsed = createGallerySchema.parse({
      title: formData.get("title"),
      slug: toSlug(String(formData.get("slug") ?? "")),
      description: String(formData.get("description") ?? "").trim() || undefined,
      category: formData.get("category"),
      visibility: formData.get("visibility"),
    });

    const gallery = await createGallery(parsed);

    invalidatePublicGalleryCache();
    await recordSecurityAuditEvent({ eventType: "gallery.create", outcome: "SUCCESS", clientIp: getClientIp(request), resourceType: "gallery", resourceId: gallery.id, metadata: { category: gallery.category, visibility: gallery.visibility } });
    return NextResponse.redirect(new URL(`/admin/galleries/${gallery.id}?notice=gallery_created`, request.url), 303);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToCreate(request, `error=invalid_gallery_payload${createCategoryQuery.replace("createCategory", "category")}`);
    }

    return redirectToCreate(request, `error=gallery_create_failed${createCategoryQuery.replace("createCategory", "category")}`);
  }
}
