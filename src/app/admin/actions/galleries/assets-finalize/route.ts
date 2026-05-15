import { after, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { MAX_GALLERY_ASSET_UPLOAD_COUNT } from "@/lib/upload-limits";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { processGalleryAssetVariants } from "@/server/services/image-variants";

export const runtime = "nodejs";
export const maxDuration = 300;

const uploadItemSchema = z.object({
  objectKey: z.string().trim().min(1),
  originalFilename: z.string().trim().min(1).max(260),
  mimeType: z.string().trim().min(1).max(120),
  fileExtension: z.string().trim().max(20).optional(),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  capturedAt: z.string().datetime().optional(),
});

const requestSchema = z.object({
  galleryId: z.string().trim().min(1),
  uploads: z.array(uploadItemSchema).min(1).max(MAX_GALLERY_ASSET_UPLOAD_COUNT),
});

function safeBigInt(value: number): bigint {
  return BigInt(Math.trunc(value));
}

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
    const securityError = verifyMutationProtection(request, typeof body?.csrfToken === "string" ? body.csrfToken : null);

    if (securityError) {
      return securityError;
    }

    const parsed = requestSchema.parse(body);

    const maxSortRecord = await prisma.galleryAsset.findFirst({
      where: { galleryId: parsed.galleryId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const startSortOrder = (maxSortRecord?.sortOrder ?? -1) + 1;

    const createdAssets = await prisma.$transaction(
      parsed.uploads.map((upload, index) =>
        prisma.galleryAsset.create({
          data: {
            galleryId: parsed.galleryId,
            storageKey: upload.objectKey,
            originalFilename: upload.originalFilename,
            mimeType: upload.mimeType,
            fileExtension: upload.fileExtension,
            sizeBytes: safeBigInt(upload.sizeBytes),
            width: upload.width,
            height: upload.height,
            capturedAt: upload.capturedAt ? new Date(upload.capturedAt) : undefined,
            sortOrder: startSortOrder + index,
          },
          select: {
            id: true,
          },
        }),
      ),
    );
    const createdIds = createdAssets.map((asset) => asset.id);

    after(async () => {
      await processGalleryAssetVariants(createdIds);
    });

    return NextResponse.json({
      ok: true,
      createdCount: createdAssets.length,
      createdIds,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid asset finalize payload.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Unable to finalize uploaded assets." }, { status: 500 });
  }
}
