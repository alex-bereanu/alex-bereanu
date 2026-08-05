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
  MAX_ARCHIVE_SIZE_BYTES,
  validateZipUploadMetadata,
} from "@/server/security/upload-validation";
import { createGalleryUploadSession } from "@/server/services/media-upload-sessions";
import { isAdminPhase6ReleaseEnabled } from "@/server/services/admin-phase6-release";

const requestSchema = z.object({
  galleryId: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(260),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_ARCHIVE_SIZE_BYTES),
  sha256: z.string().trim().regex(/^[a-f0-9]{64}$/),
});

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (isAdminPhase6ReleaseEnabled()) {
    return NextResponse.json({ error: "Archive delivery is retired." }, { status: 404 });
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

    if (!env.MEDIA_SCANNER_URL || !env.MEDIA_SCANNER_SECRET) {
      return NextResponse.json({ error: "Archive malware scanning is not configured." }, { status: 503 });
    }
    const zipValidationError = validateZipUploadMetadata({
      filename: parsed.filename,
      contentType: parsed.contentType,
      sizeBytes: parsed.sizeBytes,
    });

    if (zipValidationError) {
      return NextResponse.json({ error: zipValidationError }, { status: 400 });
    }

    const session = await createGalleryUploadSession({
      galleryId: parsed.galleryId,
      kind: "GALLERY_ARCHIVE",
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
