import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  createGalleryAccessToken,
  getGalleryAccessCookieName,
  getGalleryAccessMaxAgeSeconds,
  hashGalleryCapabilityToken,
  isGalleryCapabilityToken,
} from "@/server/auth/gallery-access";
import { getSecureCookieOptions } from "@/server/auth/cookies";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { sanitizeSameOriginPath, verifyMutationProtection } from "@/server/security/request-protection";
import { buildRateLimitKey, checkRateLimit, getClientIp, rateLimitRedirectResponse } from "@/server/security/rate-limit";
import { verifyTurnstileToken } from "@/server/security/turnstile";

const unlockSchema = z.object({
  slug: z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(1),
  redirectTo: z.string().trim().optional(),
});

function redirectToGallery(request: Request, slug: string, errorCode?: string): NextResponse {
  const url = new URL(`/g/${slug}`, request.url);

  if (errorCode) {
    url.searchParams.set("error", errorCode);
  }

  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const clientIp = getClientIp(request);

  if (!env.DATABASE_URL) {
    return NextResponse.json({ error: "Server is missing DATABASE_URL configuration." }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));

    if (securityError) {
      return securityError;
    }

    const turnstileError = await verifyTurnstileToken(
      request,
      String(formData.get("cf-turnstile-response") ?? ""),
      "gallery_unlock",
    );

    if (turnstileError) {
      return turnstileError;
    }

    const parsed = unlockSchema.parse({
      slug: formData.get("slug"),
      password: formData.get("password"),
      redirectTo: formData.get("redirectTo"),
    });
    const unlockRateLimit = await checkRateLimit({
      key: buildRateLimitKey("gallery-unlock", request, hashGalleryCapabilityToken(parsed.slug)),
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!unlockRateLimit.allowed) {
      await recordSecurityAuditEvent({
        eventType: "gallery.unlock",
        outcome: "DENIED",
        clientIp,
        metadata: { reason: "rate_limited" },
      });
      return rateLimitRedirectResponse(request, `/g/${parsed.slug}`, unlockRateLimit.retryAfterSeconds);
    }

    if (!isGalleryCapabilityToken(parsed.slug)) {
      await recordSecurityAuditEvent({ eventType: "gallery.unlock", outcome: "DENIED", clientIp, metadata: { reason: "invalid_capability" } });
      return redirectToGallery(request, parsed.slug, "not_found");
    }

    const shareLink = await prisma.galleryShareLink.findFirst({
      where: {
        tokenHash: hashGalleryCapabilityToken(parsed.slug),
        isActive: true,
        gallery: {
          isActive: true,
          visibility: "PRIVATE",
        },
      },
      select: {
        id: true,
        grantVersion: true,
        isActive: true,
        expiresAt: true,
        passwordHash: true,
      },
    });

    if (!shareLink || !shareLink.isActive) {
      await recordSecurityAuditEvent({ eventType: "gallery.unlock", outcome: "DENIED", clientIp, metadata: { reason: "not_found" } });
      return redirectToGallery(request, parsed.slug, "not_found");
    }

    if (shareLink.expiresAt && shareLink.expiresAt.getTime() < Date.now()) {
      await recordSecurityAuditEvent({
        eventType: "gallery.unlock",
        outcome: "DENIED",
        clientIp,
        resourceType: "share_link",
        resourceId: shareLink.id,
        metadata: { reason: "expired" },
      });
      return redirectToGallery(request, parsed.slug, "expired");
    }

    if (!shareLink.passwordHash) {
      await recordSecurityAuditEvent({
        eventType: "gallery.unlock",
        outcome: "DENIED",
        clientIp,
        resourceType: "share_link",
        resourceId: shareLink.id,
        metadata: { reason: "password_not_configured" },
      });
      return redirectToGallery(request, parsed.slug, "not_protected");
    }

    const passwordMatches = await bcrypt.compare(parsed.password, shareLink.passwordHash);

    if (!passwordMatches) {
      await recordSecurityAuditEvent({
        eventType: "gallery.unlock",
        outcome: "FAILURE",
        clientIp,
        resourceType: "share_link",
        resourceId: shareLink.id,
        metadata: { reason: "invalid_password" },
      });
      return redirectToGallery(request, parsed.slug, "invalid_password");
    }

    const token = await createGalleryAccessToken({
      shareLinkId: shareLink.id,
      grantVersion: shareLink.grantVersion,
    });

    const redirectPath = sanitizeSameOriginPath(parsed.redirectTo, `/g/${parsed.slug}`, request.url);
    const expectedGalleryPrefix = `/g/${parsed.slug}`;
    const response = NextResponse.redirect(
      new URL(redirectPath.startsWith(expectedGalleryPrefix) ? redirectPath : expectedGalleryPrefix, request.url),
      303,
    );

    response.cookies.set({
      name: getGalleryAccessCookieName(),
      value: token,
      ...getSecureCookieOptions(getGalleryAccessMaxAgeSeconds()),
    });

    await recordSecurityAuditEvent({
      eventType: "gallery.unlock",
      outcome: "SUCCESS",
      clientIp,
      resourceType: "share_link",
      resourceId: shareLink.id,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid unlock payload.", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to unlock gallery." }, { status: 500 });
  }
}
