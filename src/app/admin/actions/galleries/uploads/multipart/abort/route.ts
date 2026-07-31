import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { abortArchiveMultipartSession } from "@/server/services/media-upload-sessions";

const requestSchema = z.object({
  galleryId: z.string().trim().min(1),
  uploadSessionId: z.string().uuid(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;

  try {
    const body = await request.json();
    const securityError = verifyMutationProtection(request, typeof body?.csrfToken === "string" ? body.csrfToken : null);
    if (securityError) return securityError;

    const parsed = requestSchema.parse(body);
    const aborted = await abortArchiveMultipartSession(parsed);
    if (!aborted) return NextResponse.json({ error: "Upload session is unavailable." }, { status: 404 });

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid multipart cancellation payload.", issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to cancel multipart upload." }, { status: 500 });
  }
}
