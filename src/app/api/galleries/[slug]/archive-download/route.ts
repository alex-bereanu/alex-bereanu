import { NextResponse } from "next/server";

import { createSignedDownloadUrl } from "@/server/services/storage";
import { resolveGalleryAccessBySlug } from "@/server/services/gallery-access";

type RouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(_: Request, { params }: RouteProps): Promise<NextResponse> {
  const { slug } = await params;
  const access = await resolveGalleryAccessBySlug(slug);

  if (!access || !access.archiveObjectKey) {
    return NextResponse.json({ error: "Archive not available." }, { status: 404 });
  }

  const signedUrl = await createSignedDownloadUrl({
    objectKey: access.archiveObjectKey,
    downloadFilename: access.archiveFilename ?? `${access.slug}.zip`,
    expiresInSeconds: 60 * 10,
  });

  return NextResponse.redirect(signedUrl, 302);
}
