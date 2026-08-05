import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";

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

  const phase2 = isAdminGalleryPhase2Enabled();
  const common = { where: { galleryId, ...(phase2 ? { deletedAt: null } : {}) }, orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }], cursor: { id: cursor }, skip: 1, take: PAGE_SIZE + 1 };
  const assets = phase2
    ? await prisma.galleryAsset.findMany({ ...common, select: { id: true, originalFilename: true, mimeType: true, width: true, height: true, status: true, failureReason: true, altText: true, caption: true, focalX: true, focalY: true, capturedAt: true } })
    : (await prisma.galleryAsset.findMany({ ...common, select: { id: true, originalFilename: true, mimeType: true, width: true, height: true, status: true, failureReason: true, capturedAt: true } })).map((asset) => ({ ...asset, altText: null, caption: null, focalX: null, focalY: null }));
  const pageAssets = assets.slice(0, PAGE_SIZE);

  return NextResponse.json(
    {
      assets: pageAssets.map((asset) => ({
        ...asset,
        capturedAt: asset.capturedAt?.toISOString() ?? null,
        previewUrl: asset.status === "READY" ? `/admin/media/assets/${asset.id}/small` : null,
      })),
      nextCursor: assets.length > PAGE_SIZE ? pageAssets[PAGE_SIZE - 1]?.id ?? null : null,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } },
  );
}
