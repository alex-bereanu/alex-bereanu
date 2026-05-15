import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { formatBytes } from "@/lib/upload-limits";
import { uploadObject } from "@/server/services/storage";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import {
  MAX_GALLERY_ASSET_SIZE_BYTES,
  validateImageFileSignature,
  validateImageUploadMetadata,
} from "@/server/security/upload-validation";

const payloadSchema = z.object({
  galleryId: z.string().trim().min(1),
  objectKey: z.string().trim().min(1),
  contentType: z.string().trim().min(1).max(120),
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

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "Missing upload file." }, { status: 400 });
    }

    if (file.size > MAX_GALLERY_ASSET_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Image must be no more than ${formatBytes(MAX_GALLERY_ASSET_SIZE_BYTES)}.` },
        { status: 400 },
      );
    }

    const parsed = payloadSchema.parse({
      galleryId: formData.get("galleryId"),
      objectKey: formData.get("objectKey"),
      contentType: formData.get("contentType") ?? file.type ?? "application/octet-stream",
    });
    const imageValidationError = validateImageUploadMetadata({
      filename: file.name,
      contentType: parsed.contentType,
      sizeBytes: file.size,
      maxSizeBytes: MAX_GALLERY_ASSET_SIZE_BYTES,
    });

    if (imageValidationError) {
      return NextResponse.json({ error: imageValidationError }, { status: 400 });
    }

    const expectedPrefix = `galleries/${parsed.galleryId}/assets/`;

    if (!parsed.objectKey.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Invalid object key for gallery asset upload." }, { status: 400 });
    }

    const gallery = await prisma.gallery.findUnique({
      where: { id: parsed.galleryId },
      select: { id: true },
    });

    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found." }, { status: 404 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const signatureValidationError = validateImageFileSignature(fileBuffer, parsed.contentType);

    if (signatureValidationError) {
      return NextResponse.json({ error: signatureValidationError }, { status: 400 });
    }

    await uploadObject({
      objectKey: parsed.objectKey,
      contentType: parsed.contentType,
      body: fileBuffer,
    });

    return NextResponse.json({ ok: true, objectKey: parsed.objectKey });
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

    console.error("Unable to upload gallery asset.", error);
    return NextResponse.json({ error: "Unable to upload gallery asset." }, { status: 500 });
  }
}
