import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";

const reorderSchema = z.object({
  galleryId: z.string().trim().min(1),
  assetIds: z.array(z.string().trim().min(1)).min(1).max(5000),
});

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (!env.DATABASE_URL) {
    return NextResponse.json({ error: "Server is missing DATABASE_URL configuration." }, { status: 500 });
  }

  try {
    const body = await request.json();
    const parsed = reorderSchema.parse(body);

    const uniqueAssetIds = [...new Set(parsed.assetIds)];

    if (uniqueAssetIds.length !== parsed.assetIds.length) {
      return NextResponse.json({ error: "Asset ID list contains duplicates." }, { status: 400 });
    }

    const existingAssets = await prisma.galleryAsset.findMany({
      where: {
        galleryId: parsed.galleryId,
      },
      select: {
        id: true,
      },
    });

    if (existingAssets.length !== parsed.assetIds.length) {
      return NextResponse.json({ error: "Asset list does not match gallery asset count." }, { status: 400 });
    }

    const existingIds = new Set(existingAssets.map((asset) => asset.id));
    const hasUnknownAsset = parsed.assetIds.some((id) => !existingIds.has(id));

    if (hasUnknownAsset) {
      return NextResponse.json({ error: "Asset list contains unknown IDs." }, { status: 400 });
    }

    await prisma.$transaction(
      parsed.assetIds.map((assetId, index) =>
        prisma.galleryAsset.update({
          where: { id: assetId },
          data: { sortOrder: index },
          select: { id: true },
        }),
      ),
    );

    return NextResponse.json({
      ok: true,
      updatedCount: parsed.assetIds.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid reorder payload.", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to save asset order." }, { status: 500 });
  }
}
