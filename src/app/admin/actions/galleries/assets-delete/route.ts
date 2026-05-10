import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { deleteObjectByKey } from "@/server/services/storage";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";

const deleteSchema = z.object({
  assetId: z.string().trim().min(1),
  galleryId: z.string().trim().min(1),
});

function redirectToAdmin(request: Request, query: string): NextResponse {
  const url = new URL(`/admin?${query}`, request.url);
  return NextResponse.redirect(url, 303);
}

function wantsJsonResponse(request: Request): boolean {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

async function parseDeletePayload(request: Request): Promise<z.infer<typeof deleteSchema>> {
  if (wantsJsonResponse(request)) {
    return deleteSchema.parse(await request.json());
  }

  const formData = await request.formData();

  return deleteSchema.parse({
    assetId: formData.get("assetId"),
    galleryId: formData.get("galleryId"),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  const jsonMode = wantsJsonResponse(request);

  if (!env.DATABASE_URL) {
    if (jsonMode) {
      return NextResponse.json({ error: "Server is missing DATABASE_URL configuration." }, { status: 500 });
    }

    return redirectToAdmin(request, "error=database_not_configured");
  }

  try {
    const parsed = await parseDeletePayload(request);

    const asset = await prisma.galleryAsset.findFirst({
      where: {
        id: parsed.assetId,
        galleryId: parsed.galleryId,
      },
      select: {
        id: true,
        storageKey: true,
        smallStorageKey: true,
        mediumStorageKey: true,
      },
    });

    if (!asset) {
      if (jsonMode) {
        return NextResponse.json({ error: "Asset not found." }, { status: 404 });
      }

      return redirectToAdmin(request, "error=asset_delete_failed");
    }

    const objectKeys = [asset.storageKey, asset.smallStorageKey, asset.mediumStorageKey].filter(
      (objectKey): objectKey is string => Boolean(objectKey),
    );

    await Promise.allSettled(objectKeys.map((objectKey) => deleteObjectByKey(objectKey)));

    await prisma.galleryAsset.delete({
      where: {
        id: asset.id,
      },
    });

    if (jsonMode) {
      return NextResponse.json({ ok: true, deletedAssetId: asset.id });
    }

    return redirectToAdmin(request, "notice=asset_deleted");
  } catch (error) {
    if (error instanceof z.ZodError) {
      if (jsonMode) {
        return NextResponse.json({ error: "Invalid payload.", issues: error.issues }, { status: 400 });
      }

      return redirectToAdmin(request, "error=invalid_asset_delete_payload");
    }

    if (jsonMode) {
      return NextResponse.json({ error: "Unable to delete asset from storage and database." }, { status: 500 });
    }

    return redirectToAdmin(request, "error=asset_delete_failed");
  }
}
