import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { getArchiveMultipartPartUrl } from "@/server/services/media-upload-sessions";

const requestSchema = z.object({
  galleryId: z.string().trim().min(1),
  uploadSessionId: z.string().uuid(),
  partNumber: z.number().int().min(1).max(10_000),
});

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;

  try {
    const body = await request.json();
    const securityError = verifyMutationProtection(request, typeof body?.csrfToken === "string" ? body.csrfToken : null);
    if (securityError) return securityError;

    const parsed = requestSchema.parse(body);
    const uploadUrl = await getArchiveMultipartPartUrl(parsed);
    if (!uploadUrl) return NextResponse.json({ error: "Multipart part is unavailable." }, { status: 404 });

    return NextResponse.json(
      { uploadUrl },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid multipart part payload.", issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to authorize multipart part." }, { status: 500 });
  }
}
