import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { requireAdminRequestSessionDetails } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { retryPendingStorageDeletions } from "@/server/services/storage-deletions";

const retrySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function redirectToAdmin(request: Request, query: string): NextResponse {
  return NextResponse.redirect(new URL(`/admin/operations?${query}`, request.url), 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAdminRequestSessionDetails(request);
  if (auth.response) return auth.response;
  const clientIp = getClientIp(request);

  if (!env.DATABASE_URL) {
    return redirectToAdmin(request, "error=database_not_configured");
  }

  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));

    if (securityError) {
      return securityError;
    }

    const parsed = retrySchema.parse({ limit: formData.get("limit") ?? 50 });
    const attempted = await retryPendingStorageDeletions(parsed.limit);
    await recordSecurityAuditEvent({ eventType: "storage.deletion.retry", outcome: "SUCCESS", actor: auth.session.subject, clientIp, metadata: { attempted } });
    return redirectToAdmin(request, `notice=storage_deletions_retried&attempted=${attempted}`);
  } catch (error) {
    if (error instanceof z.ZodError) {
      await recordSecurityAuditEvent({ eventType: "storage.deletion.retry", outcome: "DENIED", actor: auth.session.subject, clientIp, metadata: { reason: "invalid_payload" } });
      return redirectToAdmin(request, "error=invalid_storage_deletion_retry");
    }

    await recordSecurityAuditEvent({ eventType: "storage.deletion.retry", outcome: "ERROR", actor: auth.session.subject, clientIp, metadata: { reason: error instanceof Error ? error.name : "UnknownError" } });
    return redirectToAdmin(request, "error=storage_deletion_retry_failed");
  }
}
