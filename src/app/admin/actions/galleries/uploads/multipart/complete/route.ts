import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { completeArchiveMultipartSession } from "@/server/services/media-upload-sessions";

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
    const completed = await completeArchiveMultipartSession(parsed);
    if (!completed) return NextResponse.json({ error: "Archive parts are incomplete or invalid." }, { status: 409 });

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid multipart completion payload.", issues: error.issues }, { status: 400 });
    }
    console.error("Unable to complete multipart upload.", error);
    return NextResponse.json({ error: "Unable to complete multipart upload." }, { status: 500 });
  }
}
