import { GalleryCategory, GalleryVisibility } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { toSlug } from "@/lib/slug";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";

const createGallerySchema = z.object({
  title: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  category: z.nativeEnum(GalleryCategory),
  visibility: z.nativeEnum(GalleryVisibility),
});

function redirectToAdmin(request: Request, query: string): NextResponse {
  const url = new URL(`/admin?${query}`, request.url);
  return NextResponse.redirect(url, 303);
}

function resolveRedirectCategory(formData: FormData): string {
  const rawValue = String(formData.get("redirectCategory") ?? formData.get("category") ?? "").trim().toUpperCase();

  if (!Object.values(GalleryCategory).includes(rawValue as GalleryCategory)) {
    return "";
  }

  return `&createCategory=${rawValue}`;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (!env.DATABASE_URL) {
    return redirectToAdmin(request, "error=database_not_configured");
  }

  const formData = await request.formData();
  const createCategoryQuery = resolveRedirectCategory(formData);

  try {
    const parsed = createGallerySchema.parse({
      title: formData.get("title"),
      slug: toSlug(String(formData.get("slug") ?? "")),
      description: String(formData.get("description") ?? "").trim() || undefined,
      category: formData.get("category"),
      visibility: formData.get("visibility"),
    });

    await prisma.gallery.create({
      data: {
        title: parsed.title,
        slug: parsed.slug,
        description: parsed.description,
        category: parsed.category,
        visibility: parsed.visibility,
      },
    });

    return redirectToAdmin(request, `notice=gallery_created${createCategoryQuery}`);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToAdmin(request, `error=invalid_gallery_payload${createCategoryQuery}`);
    }

    return redirectToAdmin(request, `error=gallery_create_failed${createCategoryQuery}`);
  }
}
