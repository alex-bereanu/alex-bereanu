import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { requireRecentAdminRequestSession } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import { purgeGalleryAsset } from "@/server/services/gallery-recycle-bin";

const schema = z.object({ galleryId: z.string().trim().min(1).max(200), assetId: z.string().trim().min(1).max(200), confirmation: z.literal("PURGE") });

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireRecentAdminRequestSession(request, "json");
  if (auth.response) return auth.response;
  if (!env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured." }, { status: 500 });
  if (!isAdminGalleryPhase2Enabled()) return NextResponse.json({ error: "Gallery Phase 2 is not enabled." }, { status: 409 });
  try {
    const body = await request.json();
    const securityError = verifyMutationProtection(request, typeof body?.csrfToken === "string" ? body.csrfToken : null);
    if (securityError) return securityError;
    const parsed = schema.parse(body);
    const purged = await purgeGalleryAsset(parsed);
    await recordSecurityAuditEvent({ eventType: "gallery.asset.purge", outcome: purged ? "SUCCESS" : "FAILURE", actor: auth.session.subject, clientIp: getClientIp(request), resourceType: "gallery", resourceId: parsed.galleryId, metadata: { asset_id: parsed.assetId } });
    return purged ? NextResponse.json({ ok: true, purged: true }) : NextResponse.json({ error: "Recycled photo not found." }, { status: 404 });
  } catch (error) {
    await recordSecurityAuditEvent({ eventType: "gallery.asset.purge", outcome: error instanceof z.ZodError ? "DENIED" : "ERROR", actor: auth.session.subject, clientIp: getClientIp(request), metadata: { reason: error instanceof Error ? error.name : "UnknownError" } });
    return NextResponse.json({ error: error instanceof z.ZodError ? "Type PURGE to confirm permanent removal." : "Unable to purge the photo." }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
