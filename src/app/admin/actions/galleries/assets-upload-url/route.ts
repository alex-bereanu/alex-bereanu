import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import {
  createSignedUploadUrl,
  getObjectCacheControl,
} from "@/server/services/storage";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import {
  MAX_GALLERY_ASSET_SIZE_BYTES,
  validateImageUploadMetadata,
} from "@/server/security/upload-validation";
import { createGalleryUploadSession } from "@/server/services/media-upload-sessions";

const requestSchema = z.object({
  galleryId: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(260),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_GALLERY_ASSET_SIZE_BYTES),
  sha256: z.string().trim().regex(/^[a-f0-9]{64}$/),
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

    const session = await createGalleryUploadSession({
      galleryId: parsed.galleryId,
      kind: "GALLERY_ASSET",
      filename: parsed.filename,
      contentType: parsed.contentType,
      sizeBytes: parsed.sizeBytes,
      sha256: parsed.sha256,
    });

    if (!session) {
      return NextResponse.json({ error: "Gallery not found." }, { status: 404 });
    }

    const uploadUrl = await createSignedUploadUrl({
      area: session.storageArea,
      objectKey: session.objectKey,
      contentType: parsed.contentType,
      expiresInSeconds: 60 * 20,
      metadata: session.metadata,
    });

    return NextResponse.json({
      uploadUrl,
      uploadSessionId: session.id,
      objectKey: session.objectKey,
      filename: session.filename,
      contentType: parsed.contentType,
      cacheControl: getObjectCacheControl(session.storageArea),
      requiredHeaders: {
        "x-amz-meta-upload-session-id": session.id,
        "x-amz-meta-expected-sha256": parsed.sha256,
      },
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
