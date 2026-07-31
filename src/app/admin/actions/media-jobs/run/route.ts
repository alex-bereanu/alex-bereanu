import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { runMediaProcessingQueue } from "@/server/services/media-processing";
import { reconcileExpiredUploadSessions } from "@/server/services/media-upload-sessions";
import { invalidatePublicGalleryCache } from "@/server/services/public-cache";

export const runtime = "nodejs";
export const maxDuration = 300;

const runSchema = z.object({ limit: z.coerce.number().int().min(1).max(10).default(2) });

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;

  if (!env.DATABASE_URL) {
    return NextResponse.redirect(new URL("/admin?error=database_not_configured", request.url), 303);
  }

  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));
    if (securityError) return securityError;

    const { limit } = runSchema.parse({ limit: formData.get("limit") ?? 2 });
    const result = await runMediaProcessingQueue(limit);
    if (result.processed > 0) invalidatePublicGalleryCache();
    await reconcileExpiredUploadSessions(100);
    return NextResponse.redirect(
      new URL(`/admin?notice=media_jobs_processed&processed=${result.processed}&failed=${result.failed}`, request.url),
      303,
    );
  } catch (error) {
    const code = error instanceof z.ZodError ? "invalid_media_job_request" : "media_job_run_failed";
    return NextResponse.redirect(new URL(`/admin?error=${code}`, request.url), 303);
  }
}
