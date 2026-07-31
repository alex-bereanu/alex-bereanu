import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { retryPendingStorageDeletions } from "@/server/services/storage-deletions";

const retrySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function redirectToAdmin(request: Request, query: string): NextResponse {
  return NextResponse.redirect(new URL(`/admin?${query}`, request.url), 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

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
    return redirectToAdmin(request, `notice=storage_deletions_retried&attempted=${attempted}`);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToAdmin(request, "error=invalid_storage_deletion_retry");
    }

    return redirectToAdmin(request, "error=storage_deletion_retry_failed");
  }
}
