import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { requireAdminRequestSessionDetails } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { runMediaProcessingQueue } from "@/server/services/media-processing";
import { reconcileExpiredUploadSessions } from "@/server/services/media-upload-sessions";
import { invalidatePublicGalleryCache } from "@/server/services/public-cache";

export const runtime = "nodejs";
export const maxDuration = 300;

const runSchema = z.object({ limit: z.coerce.number().int().min(1).max(10).default(2) });

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAdminRequestSessionDetails(request);
  if (auth.response) return auth.response;
  const clientIp = getClientIp(request);

  if (!env.DATABASE_URL) {
    return NextResponse.redirect(new URL("/admin/operations?error=database_not_configured", request.url), 303);
  }

  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));
    if (securityError) return securityError;

    const { limit } = runSchema.parse({ limit: formData.get("limit") ?? 2 });
    const result = await runMediaProcessingQueue(limit);
    if (result.processed > 0) invalidatePublicGalleryCache();
    await reconcileExpiredUploadSessions(100);
    await recordSecurityAuditEvent({ eventType: "media.queue.run", outcome: "SUCCESS", actor: auth.session.subject, clientIp, metadata: { processed: result.processed, failed: result.failed } });
    return NextResponse.redirect(
      new URL(`/admin/operations?notice=media_jobs_processed&processed=${result.processed}&failed=${result.failed}`, request.url),
      303,
    );
  } catch (error) {
    await recordSecurityAuditEvent({ eventType: "media.queue.run", outcome: error instanceof z.ZodError ? "DENIED" : "ERROR", actor: auth.session.subject, clientIp, metadata: { reason: error instanceof Error ? error.name : "UnknownError" } });
    const code = error instanceof z.ZodError ? "invalid_media_job_request" : "media_job_run_failed";
    return NextResponse.redirect(new URL(`/admin/operations?error=${code}`, request.url), 303);
  }
}
