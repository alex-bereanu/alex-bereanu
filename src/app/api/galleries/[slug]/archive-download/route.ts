import { NextResponse } from "next/server";

import { createSignedDownloadUrl } from "@/server/services/storage";
import {
  galleryCapabilityMatchesAccess,
  recordGalleryShareLinkDownload,
  resolveGalleryAccessFromCookie,
} from "@/server/services/gallery-access";

type RouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(_: Request, { params }: RouteProps): Promise<NextResponse> {
  const { slug } = await params;
  const access = await resolveGalleryAccessFromCookie();

  if (!access || !galleryCapabilityMatchesAccess(slug, access) || !access.archiveObjectKey) {
    return NextResponse.json({ error: "Archive not available." }, { status: 404 });
  }

  const downloadAllowed = await recordGalleryShareLinkDownload(access.shareLinkId);

  if (!downloadAllowed) {
    return NextResponse.json({ error: "Download limit reached for this gallery link." }, { status: 403 });
  }

  const signedUrl = await createSignedDownloadUrl({
    area: "PRIVATE",
    objectKey: access.archiveObjectKey,
    downloadFilename: access.archiveFilename ?? "gallery.zip",
    expiresInSeconds: 60 * 2,
  });

  return NextResponse.redirect(signedUrl, 302);
}
