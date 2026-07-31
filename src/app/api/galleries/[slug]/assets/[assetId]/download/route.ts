import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { createSignedDownloadUrl } from "@/server/services/storage";
import {
  galleryCapabilityMatchesAccess,
  recordGalleryShareLinkDownload,
  resolveGalleryAccessFromCookie,
} from "@/server/services/gallery-access";

type RouteProps = {
  params: Promise<{ slug: string; assetId: string }>;
};

export async function GET(_: Request, { params }: RouteProps): Promise<NextResponse> {
  const { slug, assetId } = await params;
  const access = await resolveGalleryAccessFromCookie();

  if (!access || !galleryCapabilityMatchesAccess(slug, access)) {
    return NextResponse.json({ error: "Gallery not accessible." }, { status: 404 });
  }

  const asset = await prisma.galleryAsset.findFirst({
    where: {
      id: assetId,
      galleryId: access.galleryId,
      status: "READY",
    },
    select: {
      storageKey: true,
      sourceStorageArea: true,
      originalFilename: true,
    },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }

  const downloadAllowed = await recordGalleryShareLinkDownload(access.shareLinkId);

  if (!downloadAllowed) {
    return NextResponse.json({ error: "Download limit reached for this gallery link." }, { status: 403 });
  }

  const signedUrl = await createSignedDownloadUrl({
    area: asset.sourceStorageArea,
    objectKey: asset.storageKey,
    downloadFilename: asset.originalFilename,
    expiresInSeconds: 60 * 2,
  });

  return NextResponse.redirect(signedUrl, 302);
}
