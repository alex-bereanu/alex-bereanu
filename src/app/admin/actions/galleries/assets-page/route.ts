import { NextResponse } from "next/server";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";

const PAGE_SIZE = 40;

export async function GET(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;

  const params = new URL(request.url).searchParams;
  const galleryId = params.get("galleryId")?.trim() ?? "";
  const cursor = params.get("cursor")?.trim() ?? "";
  if (!galleryId || !cursor || galleryId.length > 200 || cursor.length > 200) {
    return NextResponse.json({ error: "Invalid asset page request." }, { status: 400 });
  }

  const gallery = await prisma.gallery.findUnique({
    where: { id: galleryId },
    select: { visibility: true },
  });
  if (!gallery) return NextResponse.json({ error: "Gallery not found." }, { status: 404 });

  const assets = await prisma.galleryAsset.findMany({
    where: { galleryId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    cursor: { id: cursor },
    skip: 1,
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      originalFilename: true,
      smallStorageKey: true,
      mimeType: true,
      width: true,
      height: true,
      status: true,
      failureReason: true,
    },
  });
  const pageAssets = assets.slice(0, PAGE_SIZE);
  const publicBase = env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? null;

  return NextResponse.json(
    {
      assets: pageAssets.map(({ smallStorageKey, ...asset }) => ({
        ...asset,
        previewUrl:
          asset.status === "READY" && gallery.visibility === "PUBLIC" && publicBase && smallStorageKey
            ? `${publicBase}/${smallStorageKey}`
            : null,
      })),
      nextCursor: assets.length > PAGE_SIZE ? pageAssets[PAGE_SIZE - 1]?.id ?? null : null,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } },
  );
}
