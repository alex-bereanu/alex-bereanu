import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { requireAdminRequestSessionDetails } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { retryMediaJob } from "@/server/services/media-processing";

const retrySchema = z.object({ jobId: z.string().uuid() });

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

    const { jobId } = retrySchema.parse({ jobId: formData.get("jobId") });
    const queued = await retryMediaJob(jobId);
    await recordSecurityAuditEvent({ eventType: "media.job.retry", outcome: queued ? "SUCCESS" : "FAILURE", actor: auth.session.subject, clientIp, resourceType: "media_job", resourceId: jobId });
    return NextResponse.redirect(
      new URL(queued ? "/admin/operations?notice=media_job_retried" : "/admin/operations?error=media_job_not_retryable", request.url),
      303,
    );
  } catch (error) {
    await recordSecurityAuditEvent({ eventType: "media.job.retry", outcome: error instanceof z.ZodError ? "DENIED" : "ERROR", actor: auth.session.subject, clientIp, metadata: { reason: error instanceof Error ? error.name : "UnknownError" } });
    const code = error instanceof z.ZodError ? "invalid_media_job_request" : "media_job_retry_failed";
    return NextResponse.redirect(new URL(`/admin/operations?error=${code}`, request.url), 303);
  }
}
