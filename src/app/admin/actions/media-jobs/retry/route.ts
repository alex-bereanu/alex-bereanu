import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { retryMediaJob } from "@/server/services/media-processing";

const retrySchema = z.object({ jobId: z.string().uuid() });

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

    const { jobId } = retrySchema.parse({ jobId: formData.get("jobId") });
    const queued = await retryMediaJob(jobId);
    return NextResponse.redirect(
      new URL(queued ? "/admin?notice=media_job_retried" : "/admin?error=media_job_not_retryable", request.url),
      303,
    );
  } catch (error) {
    const code = error instanceof z.ZodError ? "invalid_media_job_request" : "media_job_retry_failed";
    return NextResponse.redirect(new URL(`/admin?error=${code}`, request.url), 303);
  }
}
