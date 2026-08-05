import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import { restoreGalleryAssets } from "@/server/services/gallery-recycle-bin";

const schema = z.object({ galleryId: z.string().trim().min(1).max(200), assetIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100) });

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;
  if (!env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured." }, { status: 500 });
  if (!isAdminGalleryPhase2Enabled()) return NextResponse.json({ error: "Gallery Phase 2 is not enabled." }, { status: 409 });
  try {
    const body = await request.json();
    const securityError = verifyMutationProtection(request, typeof body?.csrfToken === "string" ? body.csrfToken : null);
    if (securityError) return securityError;
    const parsed = schema.parse(body);
    const restored = await restoreGalleryAssets(parsed);
    await recordSecurityAuditEvent({ eventType: "gallery.asset.restore", outcome: "SUCCESS", clientIp: getClientIp(request), resourceType: "gallery", resourceId: parsed.galleryId, metadata: { count: restored } });
    return NextResponse.json({ ok: true, restored });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid restore request." : "Unable to restore the photo." }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
