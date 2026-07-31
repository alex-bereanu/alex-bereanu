import { NextResponse } from "next/server";

import { getPublicGalleryAssetPage } from "@/server/services/public-gallery";

type RouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: Request, { params }: RouteProps): Promise<NextResponse> {
  const { slug } = await params;
  const cursor = new URL(request.url).searchParams.get("cursor")?.trim() ?? "";

  if (!cursor || cursor.length > 200) {
    return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
  }

  const page = await getPublicGalleryAssetPage(slug, cursor);
  return NextResponse.json(page, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
