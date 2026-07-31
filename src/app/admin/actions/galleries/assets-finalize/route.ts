import { after, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { MAX_GALLERY_ASSET_UPLOAD_COUNT } from "@/lib/upload-limits";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { runMediaProcessingQueue } from "@/server/services/media-processing";
import { queueUploadedSessions } from "@/server/services/media-upload-sessions";
import { invalidatePublicGalleryCache } from "@/server/services/public-cache";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  galleryId: z.string().trim().min(1),
  uploadSessionIds: z.array(z.string().uuid()).min(1).max(MAX_GALLERY_ASSET_UPLOAD_COUNT),
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
    const queuedCount = await queueUploadedSessions({
      galleryId: parsed.galleryId,
      sessionIds: [...new Set(parsed.uploadSessionIds)],
      kind: "GALLERY_ASSET",
    });

    after(async () => {
      const result = await runMediaProcessingQueue(Math.min(queuedCount, 2));
      if (result.processed > 0) invalidatePublicGalleryCache();
    });

    return NextResponse.json({ ok: true, queuedCount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid finalize payload.", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to queue uploaded assets." }, { status: 400 });
  }
}
