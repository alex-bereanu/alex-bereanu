import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { createSignedDownloadUrl } from "@/server/services/storage";
import { resolveGalleryAccessBySlug } from "@/server/services/gallery-access";

type RouteProps = {
  params: Promise<{ slug: string; assetId: string }>;
};

export async function GET(_: Request, { params }: RouteProps): Promise<NextResponse> {
  const { slug, assetId } = await params;
  const access = await resolveGalleryAccessBySlug(slug);

  if (!access) {
    return NextResponse.json({ error: "Gallery not accessible." }, { status: 404 });
  }

  const asset = await prisma.galleryAsset.findFirst({
    where: {
      id: assetId,
      galleryId: access.galleryId,
    },
    select: {
      storageKey: true,
      originalFilename: true,
    },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }

  const signedUrl = await createSignedDownloadUrl({
    objectKey: asset.storageKey,
    downloadFilename: asset.originalFilename,
    expiresInSeconds: 60 * 10,
  });

  return NextResponse.redirect(signedUrl, 302);
}
