import { NextResponse } from "next/server";

import { getPrivateGalleryAssetPage } from "@/server/services/gallery-access";

function dimensions(width: number | null, height: number | null) {
  return { width: width && width > 0 ? width : 4, height: height && height > 0 ? height : 3 };
}

export async function GET(request: Request): Promise<NextResponse> {
  const cursor = new URL(request.url).searchParams.get("cursor")?.trim() ?? "";
  if (!cursor || cursor.length > 200) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const page = await getPrivateGalleryAssetPage(cursor);
  if (!page) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const photos = page.assets.flatMap((asset) => {
    if (!asset.smallStorageKey) return [];
    const original = dimensions(asset.width, asset.height);
    const small = dimensions(asset.smallWidth ?? asset.width, asset.smallHeight ?? asset.height);
    const medium = dimensions(asset.mediumWidth ?? asset.width, asset.mediumHeight ?? asset.height);
    const large = dimensions(asset.largeWidth ?? asset.width, asset.largeHeight ?? asset.height);
    const smallSrc = `/api/gallery-media/assets/${asset.id}/small`;
    const mediumSrc = asset.mediumStorageKey ? `/api/gallery-media/assets/${asset.id}/medium` : smallSrc;
    const largeSrc = asset.largeStorageKey ? `/api/gallery-media/assets/${asset.id}/large` : mediumSrc;

    return [{
      id: asset.id,
      src: smallSrc,
      smallSrc,
      mediumSrc,
      largeSrc,
      width: original.width,
      height: original.height,
      smallWidth: small.width,
      smallHeight: small.height,
      mediumWidth: medium.width,
      mediumHeight: medium.height,
      largeWidth: large.width,
      largeHeight: large.height,
      placeholderDataUrl: asset.placeholderDataUrl ?? undefined,
      alt: asset.altText?.trim() || asset.originalFilename,
      downloadFilename: asset.originalFilename,
    }];
  });

  return NextResponse.json(
    { photos, nextCursor: page.nextCursor },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        Vary: "Cookie",
      },
    },
  );
}
