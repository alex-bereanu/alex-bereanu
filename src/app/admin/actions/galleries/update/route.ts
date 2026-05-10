import { GalleryCategory, GalleryVisibility } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { toSlug } from "@/lib/slug";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";

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
  const url = new URL(`/admin?${query}`, request.url);
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
    const parsed = updateGallerySchema.parse({
      id: formData.get("id"),
      title: formData.get("title"),
      slug: toSlug(String(formData.get("slug") ?? "")),
      description: String(formData.get("description") ?? "").trim() || undefined,
      category: formData.get("category"),
      visibility: formData.get("visibility"),
      isActive: String(formData.get("isActive") ?? "") === "on",
    });

    await prisma.gallery.update({
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

    return redirectToAdmin(request, "notice=gallery_updated");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToAdmin(request, "error=invalid_gallery_payload");
    }

    return redirectToAdmin(request, "error=gallery_update_failed");
  }
}
