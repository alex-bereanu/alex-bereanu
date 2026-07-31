import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { getAssetUploadSessionForResume } from "@/server/services/media-upload-sessions";
import { createSignedUploadUrl, getObjectCacheControl } from "@/server/services/storage";

const requestSchema = z.object({
  galleryId: z.string().trim().min(1),
  uploadSessionId: z.string().uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;

  try {
    const body = await request.json();
    const securityError = verifyMutationProtection(request, typeof body?.csrfToken === "string" ? body.csrfToken : null);
    if (securityError) return securityError;

    const parsed = requestSchema.parse(body);
    const session = await getAssetUploadSessionForResume(parsed);
    if (!session) return NextResponse.json({ error: "Upload session is unavailable or expired." }, { status: 404 });

    const uploadUrl = await createSignedUploadUrl({
      area: session.storageArea,
      objectKey: session.objectKey,
      contentType: session.contentType,
      metadata: {
        "upload-session-id": session.id,
        "expected-sha256": session.sha256,
      },
      expiresInSeconds: 60 * 20,
    });

    return NextResponse.json(
      {
        uploadUrl,
        uploadSessionId: session.id,
        contentType: session.contentType,
        cacheControl: getObjectCacheControl(session.storageArea),
        alreadyUploaded: session.status === "UPLOADED",
        requiredHeaders: {
          "x-amz-meta-upload-session-id": session.id,
          "x-amz-meta-expected-sha256": session.sha256,
        },
      },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid resume payload.", issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to resume upload." }, { status: 500 });
  }
}
