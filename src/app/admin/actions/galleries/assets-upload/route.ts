import { createHash } from "node:crypto";

import { MediaUploadKind, MediaUploadStatus } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { BYTES_PER_MEGABYTE } from "@/lib/upload-limits";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { validateImageFileSignature } from "@/server/security/upload-validation";
import { uploadObject } from "@/server/services/storage";

const MAX_RELAY_IMAGE_SIZE_BYTES = 20 * BYTES_PER_MEGABYTE;
const payloadSchema = z.object({
  galleryId: z.string().trim().min(1),
  uploadSessionId: z.string().uuid(),
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
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));

    if (securityError) {
      return securityError;
    }

    const file = formData.get("file");
    const parsed = payloadSchema.parse({
      galleryId: formData.get("galleryId"),
      uploadSessionId: formData.get("uploadSessionId"),
    });

    if (!(file instanceof File) || file.size <= 0 || file.size > MAX_RELAY_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Server-relay fallback supports image files up to 20 MB; retry the direct upload for larger files." },
        { status: 413 },
      );
    }

    const session = await prisma.mediaUploadSession.findFirst({
      where: {
        id: parsed.uploadSessionId,
        galleryId: parsed.galleryId,
        kind: MediaUploadKind.GALLERY_ASSET,
        status: { in: [MediaUploadStatus.CREATED, MediaUploadStatus.UPLOADED] },
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Upload session is invalid or expired." }, { status: 400 });
    }

    if (BigInt(file.size) !== session.expectedSizeBytes || file.type.toLowerCase() !== session.expectedContentType) {
      return NextResponse.json({ error: "Uploaded file metadata does not match its session." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const signatureError = validateImageFileSignature(buffer, session.expectedContentType);
    const actualSha256 = createHash("sha256").update(buffer).digest("hex");

    if (signatureError || actualSha256 !== session.expectedSha256) {
      return NextResponse.json({ error: signatureError ?? "Uploaded file checksum does not match." }, { status: 400 });
    }

    await uploadObject({
      area: session.storageArea,
      objectKey: session.quarantineObjectKey,
      contentType: session.expectedContentType,
      body: buffer,
      metadata: {
        "upload-session-id": session.id,
        "expected-sha256": session.expectedSha256,
      },
    });
    await prisma.mediaUploadSession.update({
      where: { id: session.id },
      data: { status: MediaUploadStatus.UPLOADED, uploadedAt: new Date() },
    });

    return NextResponse.json({ ok: true, uploadSessionId: session.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid upload payload.", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to relay image upload." }, { status: 500 });
  }
}
