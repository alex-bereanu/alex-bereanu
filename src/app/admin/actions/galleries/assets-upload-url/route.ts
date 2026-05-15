import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { createSignedUploadUrl } from "@/server/services/storage";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import {
  MAX_GALLERY_ASSET_SIZE_BYTES,
  sanitizeFilename,
  validateImageUploadMetadata,
} from "@/server/security/upload-validation";

const requestSchema = z.object({
  galleryId: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(260),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().optional(),
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
    const securityError = verifyMutationProtection(request, typeof body?.csrfToken === "string" ? body.csrfToken : null);

    if (securityError) {
      return securityError;
    }

    const parsed = requestSchema.parse(body);
    const imageValidationError = validateImageUploadMetadata({
      filename: parsed.filename,
      contentType: parsed.contentType,
      sizeBytes: parsed.sizeBytes,
      maxSizeBytes: MAX_GALLERY_ASSET_SIZE_BYTES,
    });

    if (imageValidationError) {
      return NextResponse.json({ error: imageValidationError }, { status: 400 });
    }

    const gallery = await prisma.gallery.findUnique({
      where: { id: parsed.galleryId },
      select: { id: true },
    });

    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found." }, { status: 404 });
    }

    const sanitizedFilename = sanitizeFilename(parsed.filename);
    const objectKey = `galleries/${parsed.galleryId}/assets/${Date.now()}-${sanitizedFilename}`;

    const uploadUrl = await createSignedUploadUrl({
      objectKey,
      contentType: parsed.contentType,
      expiresInSeconds: 60 * 20,
    });

    return NextResponse.json({
      uploadUrl,
      objectKey,
      filename: sanitizedFilename,
      contentType: parsed.contentType,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid asset upload payload.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    console.error("Unable to create asset upload URL.", error);
    return NextResponse.json({ error: "Unable to create asset upload URL." }, { status: 500 });
  }
}
