import { after, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { runMediaProcessingQueue } from "@/server/services/media-processing";
import { queueUploadedSessions } from "@/server/services/media-upload-sessions";
import { isAdminPhase6ReleaseEnabled } from "@/server/services/admin-phase6-release";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  galleryId: z.string().trim().min(1),
  uploadSessionId: z.string().uuid(),
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
    await queueUploadedSessions({
      galleryId: parsed.galleryId,
      sessionIds: [parsed.uploadSessionId],
      kind: "GALLERY_ARCHIVE",
    });

    after(async () => {
      await runMediaProcessingQueue(1);
    });

    return NextResponse.json({ ok: true, queuedCount: 1 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid archive finalize payload.", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to queue archive verification." }, { status: 400 });
  }
}
