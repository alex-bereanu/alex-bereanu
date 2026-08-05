import { NextResponse } from "next/server";
import { z } from "zod";

import { GalleryStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { requireAdminClientDeliveryPhase4 } from "@/server/services/admin-client-delivery-phase4";

const schema = z.object({ galleryId: z.string().trim().min(1), enabled: z.enum(["true", "false"]) });

function redirect(request: Request, galleryId: string | undefined, query: string): NextResponse {
  const path = galleryId ? `/admin/galleries/${galleryId}?tab=downloads&${query}` : `/admin/galleries?${query}`;
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;

  let galleryId: string | undefined;
  try {
    requireAdminClientDeliveryPhase4();
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));
    if (securityError) return securityError;
    const parsed = schema.parse({ galleryId: formData.get("galleryId"), enabled: formData.get("enabled") });
    galleryId = parsed.galleryId;
    const enabled = parsed.enabled === "true";

    await prisma.$transaction(async (transaction) => {
      const gallery = await transaction.gallery.findUnique({
        where: { id: parsed.galleryId },
        select: {
          id: true,
          visibility: true,
          status: true,
        },
      });
      if (!gallery || gallery.visibility !== "PRIVATE" || gallery.status !== GalleryStatus.PUBLISHED) {
        throw new Error("private_published_gallery_required");
      }
      if (enabled) {
        const [activeAssets, readyAssets] = await Promise.all([
          transaction.galleryAsset.count({ where: { galleryId: gallery.id, deletedAt: null } }),
          transaction.galleryAsset.count({ where: { galleryId: gallery.id, deletedAt: null, status: "READY", contentHash: { not: null }, sourceVerifiedAt: { not: null } } }),
        ]);
        if (activeAssets === 0 || readyAssets !== activeAssets) throw new Error("ready_assets_required");
      }

      await transaction.gallery.update({
        where: { id: gallery.id },
        data: { clientDeliveryEnabled: enabled },
        select: { id: true },
      });
      if (!enabled) {
        await transaction.galleryShareLink.updateMany({
          where: { galleryId: gallery.id, isActive: true },
          data: { isActive: false, revokedAt: new Date(), grantVersion: { increment: 1 } },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await recordSecurityAuditEvent({
      eventType: enabled ? "gallery.client_delivery.enable" : "gallery.client_delivery.disable",
      outcome: "SUCCESS",
      clientIp: getClientIp(request),
      resourceType: "gallery",
      resourceId: parsed.galleryId,
    });
    return redirect(request, parsed.galleryId, enabled ? "notice=client_delivery_enabled" : "notice=client_delivery_disabled");
  } catch (error) {
    await recordSecurityAuditEvent({
      eventType: "gallery.client_delivery.update",
      outcome: "ERROR",
      clientIp: getClientIp(request),
      resourceType: "gallery",
      resourceId: galleryId,
    });
    const code = error instanceof z.ZodError ? "invalid_client_delivery_payload" : error instanceof Error && error.message === "private_published_gallery_required" ? "private_published_gallery_required" : error instanceof Error && error.message === "ready_assets_required" ? "ready_assets_required" : "client_delivery_update_failed";
    return redirect(request, galleryId, `error=${code}`);
  }
}
