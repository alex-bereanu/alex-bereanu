import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { deleteObjectByKey } from "@/server/services/storage";

const deleteGallerySchema = z.object({
  id: z.string().trim().min(1),
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
    const parsed = deleteGallerySchema.parse({ id: formData.get("id") });

    const gallery = await prisma.gallery.findUnique({
      where: { id: parsed.id },
      select: {
        archiveObjectKey: true,
        assets: {
          select: {
            storageKey: true,
            smallStorageKey: true,
            mediumStorageKey: true,
          },
        },
      },
    });

    if (!gallery) {
      return redirectToAdmin(request, "error=gallery_not_found");
    }

    const objectKeys = [
      gallery.archiveObjectKey,
      ...gallery.assets.flatMap((asset) => [asset.storageKey, asset.smallStorageKey, asset.mediumStorageKey]),
    ].filter((objectKey): objectKey is string => Boolean(objectKey));

    await Promise.allSettled(objectKeys.map((objectKey) => deleteObjectByKey(objectKey)));
    await prisma.gallery.delete({ where: { id: parsed.id } });
    return redirectToAdmin(request, "notice=gallery_deleted");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToAdmin(request, "error=invalid_gallery_payload");
    }

    return redirectToAdmin(request, "error=gallery_delete_failed");
  }
}
