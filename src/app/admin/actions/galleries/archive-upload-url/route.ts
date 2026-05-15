import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { createSignedUploadUrl } from "@/server/services/storage";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import {
  MAX_ARCHIVE_SIZE_BYTES,
  sanitizeFilename,
  validateZipUploadMetadata,
} from "@/server/security/upload-validation";

const requestSchema = z.object({
  galleryId: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(260),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_ARCHIVE_SIZE_BYTES).optional(),
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
    const zipValidationError = validateZipUploadMetadata({
      filename: parsed.filename,
      contentType: parsed.contentType,
      sizeBytes: parsed.sizeBytes,
    });

    if (zipValidationError) {
      return NextResponse.json({ error: zipValidationError }, { status: 400 });
    }

    const gallery = await prisma.gallery.findUnique({
      where: { id: parsed.galleryId },
      select: { id: true },
    });

    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found." }, { status: 404 });
    }

    const sanitizedFilename = sanitizeFilename(parsed.filename);

    const objectKey = `galleries/${parsed.galleryId}/archives/${Date.now()}-${sanitizedFilename}`;
    const uploadUrl = await createSignedUploadUrl({
      objectKey,
      contentType: parsed.contentType,
      expiresInSeconds: 60 * 20,
    });

    return NextResponse.json({
      uploadUrl,
      objectKey,
      filename: sanitizedFilename,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid archive upload payload.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    console.error("Unable to create archive upload URL.", error);
    return NextResponse.json({ error: "Unable to create archive upload URL." }, { status: 500 });
  }
}
