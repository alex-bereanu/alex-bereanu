import { MediaJobStatus } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import { recycleGalleryAssets } from "@/server/services/gallery-recycle-bin";
import { invalidatePublicGalleryCache } from "@/server/services/public-cache";

const schema = z.object({
  galleryId: z.string().trim().min(1).max(200),
  assetIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
  action: z.enum(["RECYCLE", "RETRY", "MOVE"]),
  targetGalleryId: z.string().trim().min(1).max(200).optional(),
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
    const assetIds = [...new Set(parsed.assetIds)];
    if (assetIds.length !== parsed.assetIds.length) return NextResponse.json({ error: "Duplicate photo selection." }, { status: 400 });

    const assets = await prisma.galleryAsset.findMany({
      where: { id: { in: assetIds }, galleryId: parsed.galleryId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (assets.length !== assetIds.length) return NextResponse.json({ error: "Selection contains unavailable photos." }, { status: 400 });

    let affected = 0;
    if (parsed.action === "RECYCLE") {
      affected = await recycleGalleryAssets({ galleryId: parsed.galleryId, assetIds });
    } else if (parsed.action === "RETRY") {
      const failedJobs = await prisma.mediaProcessingJob.findMany({
        where: { assetId: { in: assetIds }, status: MediaJobStatus.FAILED },
        orderBy: { updatedAt: "desc" }, distinct: ["assetId"], select: { id: true, assetId: true },
      });
      if (failedJobs.length > 0) {
        await prisma.$transaction([
          prisma.mediaProcessingJob.updateMany({
            where: { id: { in: failedJobs.map((job) => job.id) }, status: MediaJobStatus.FAILED },
            data: { status: MediaJobStatus.RETRY, attempts: 0, availableAt: new Date(), lockedAt: null, lastError: null, completedAt: null },
          }),
          prisma.galleryAsset.updateMany({
            where: { id: { in: failedJobs.flatMap((job) => job.assetId ? [job.assetId] : []) }, deletedAt: null },
            data: { status: "PROCESSING", failureReason: null },
          }),
        ]);
      }
      affected = failedJobs.length;
    } else {
      if (!parsed.targetGalleryId || parsed.targetGalleryId === parsed.galleryId) return NextResponse.json({ error: "Choose a different target gallery." }, { status: 400 });
      if (assets.some((asset) => asset.status === "UPLOADING" || asset.status === "PROCESSING" || asset.status === "DELETING")) {
        return NextResponse.json({ error: "Wait for selected photos to finish processing before moving them." }, { status: 409 });
      }
      const [source, target, lastTarget] = await Promise.all([
        prisma.gallery.findUnique({ where: { id: parsed.galleryId }, select: { visibility: true } }),
        prisma.gallery.findUnique({ where: { id: parsed.targetGalleryId }, select: { visibility: true, status: true } }),
        prisma.galleryAsset.findFirst({ where: { galleryId: parsed.targetGalleryId, deletedAt: null }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }),
      ]);
      if (!source || !target || target.status === "ARCHIVED") return NextResponse.json({ error: "Target gallery is unavailable." }, { status: 404 });
      if (source.visibility !== target.visibility) return NextResponse.json({ error: "Photos can only move between galleries with the same storage visibility." }, { status: 409 });
      const start = (lastTarget?.sortOrder ?? -1) + 1;
      await prisma.$transaction(assetIds.map((id, index) => prisma.galleryAsset.update({ where: { id }, data: { galleryId: parsed.targetGalleryId, sortOrder: start + index }, select: { id: true } })));
      affected = assetIds.length;
      invalidatePublicGalleryCache();
    }

    await recordSecurityAuditEvent({
      eventType: `gallery.asset.batch.${parsed.action.toLowerCase()}`, outcome: "SUCCESS", clientIp: getClientIp(request),
      resourceType: "gallery", resourceId: parsed.galleryId,
      metadata: { count: affected, target_gallery_id: parsed.targetGalleryId ?? null },
    });
    return NextResponse.json({ ok: true, affected });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid batch request." : "Unable to complete the batch action." }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
