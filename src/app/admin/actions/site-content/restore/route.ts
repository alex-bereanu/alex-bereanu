import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { isSiteContentDocumentKey } from "@/lib/site-content-registry";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { isAdminContentPhase3Enabled } from "@/server/services/admin-content-phase3";
import { createRestoredDraft, hashContentActor } from "@/server/services/site-content-revisions";

const schema = z.object({ key: z.string().trim().min(1).max(120), revisionId: z.string().trim().min(1).max(200) });

function redirectEditor(request: Request, key: string | undefined, query: string) {
  return NextResponse.redirect(new URL(`${key ? `/admin/pages/${encodeURIComponent(key)}` : "/admin/pages"}?${query}`, request.url), 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;
  if (!env.DATABASE_URL) return redirectEditor(request, undefined, "error=database_not_configured");
  if (!isAdminContentPhase3Enabled()) return redirectEditor(request, undefined, "error=content_phase3_not_enabled");
  let key: string | undefined;
  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));
    if (securityError) return securityError;
    const parsed = schema.parse({ key: formData.get("key"), revisionId: formData.get("revisionId") });
    if (!isSiteContentDocumentKey(parsed.key)) throw new Error("invalid_content_key");
    key = parsed.key;
    const draft = await createRestoredDraft({ contentKey: parsed.key, revisionId: parsed.revisionId, actorHash: hashContentActor(getClientIp(request)) });
    if (!draft) return redirectEditor(request, key, "error=content_revision_not_found");
    await recordSecurityAuditEvent({ eventType: "site.content.restore", outcome: "SUCCESS", clientIp: getClientIp(request), resourceType: "site_content", resourceId: parsed.key, metadata: { source_revision_id: parsed.revisionId, revision_id: draft.id, version: draft.version } });
    return redirectEditor(request, key, `notice=content_restored_as_draft&revision=${encodeURIComponent(draft.id)}`);
  } catch (error) {
    await recordSecurityAuditEvent({ eventType: "site.content.restore", outcome: "ERROR", clientIp: getClientIp(request), resourceType: "site_content", resourceId: key });
    return redirectEditor(request, key, `error=${error instanceof z.ZodError ? "invalid_content_restore" : "content_restore_failed"}`);
  }
}
