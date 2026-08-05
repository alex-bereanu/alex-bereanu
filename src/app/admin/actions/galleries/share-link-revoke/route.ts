import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";

const revokeSchema = z.object({
  galleryId: z.string().trim().min(1),
  shareLinkId: z.string().trim().min(1),
});

function redirectToGallery(request: Request, galleryId: string | undefined, query: string): NextResponse {
  const path = galleryId ? `/admin/galleries/${galleryId}?tab=client-access&${query}` : `/admin/galleries?${query}`;
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (!env.DATABASE_URL) {
    return redirectToGallery(request, undefined, "error=database_not_configured");
  }

  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));

    if (securityError) {
      return securityError;
    }

    const parsed = revokeSchema.parse({
      galleryId: formData.get("galleryId"),
      shareLinkId: formData.get("shareLinkId"),
    });

    const result = await prisma.galleryShareLink.updateMany({
      where: {
        id: parsed.shareLinkId,
        galleryId: parsed.galleryId,
        isActive: true,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
        grantVersion: { increment: 1 },
      },
    });

    await recordSecurityAuditEvent({
      eventType: "gallery.share.revoke",
      outcome: result.count > 0 ? "SUCCESS" : "FAILURE",
      clientIp: getClientIp(request),
      resourceType: "share_link",
      resourceId: parsed.shareLinkId,
      metadata: { gallery_id: parsed.galleryId },
    });

    return redirectToGallery(
      request,
      parsed.galleryId,
      result.count > 0 ? "notice=share_link_revoked" : "error=share_link_not_found",
    );
  } catch (error) {
    return redirectToGallery(
      request,
      undefined,
      error instanceof z.ZodError ? "error=invalid_share_link_payload" : "error=share_link_revoke_failed",
    );
  }
}
