import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { prepareArchiveMultipartUpload } from "@/server/services/media-upload-sessions";

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
    const descriptor = await prepareArchiveMultipartUpload(parsed);
    if (!descriptor) return NextResponse.json({ error: "Upload session is unavailable or expired." }, { status: 404 });

    return NextResponse.json(descriptor, {
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid multipart preparation payload.", issues: error.issues }, { status: 400 });
    }
    console.error("Unable to prepare multipart upload.", error);
    return NextResponse.json({ error: "Unable to prepare multipart upload." }, { status: 500 });
  }
}
