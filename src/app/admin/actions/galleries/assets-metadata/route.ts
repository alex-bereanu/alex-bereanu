import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import { invalidatePublicGalleryCache } from "@/server/services/public-cache";

const optionalCoordinate = z.union([z.number().min(0).max(1), z.null()]);
const schema = z.object({
  galleryId: z.string().trim().min(1).max(200), assetId: z.string().trim().min(1).max(200),
  altText: z.string().trim().max(300).nullable(), caption: z.string().trim().max(2000).nullable(),
  focalX: optionalCoordinate, focalY: optionalCoordinate,
  capturedAt: z.string().datetime().nullable(),
});

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
    const updated = await prisma.galleryAsset.updateMany({
      where: { id: parsed.assetId, galleryId: parsed.galleryId, deletedAt: null },
      data: { altText: parsed.altText || null, caption: parsed.caption || null, focalX: parsed.focalX, focalY: parsed.focalY, capturedAt: parsed.capturedAt ? new Date(parsed.capturedAt) : null },
    });
    if (updated.count === 0) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    invalidatePublicGalleryCache();
    await recordSecurityAuditEvent({ eventType: "gallery.asset.metadata", outcome: "SUCCESS", clientIp: getClientIp(request), resourceType: "gallery", resourceId: parsed.galleryId, metadata: { asset_id: parsed.assetId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid photo metadata." : "Unable to save photo metadata." }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
