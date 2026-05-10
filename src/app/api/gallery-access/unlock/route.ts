import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  createGalleryAccessToken,
  getGalleryAccessCookieName,
  getGalleryAccessMaxAgeSeconds,
} from "@/server/auth/gallery-access";
import { getSecureCookieOptions } from "@/server/auth/cookies";
import { checkRateLimit, getClientIp, rateLimitRedirectResponse } from "@/server/security/rate-limit";

const unlockSchema = z.object({
  slug: z.string().trim().min(1),
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
    const parsed = unlockSchema.parse({
      slug: formData.get("slug"),
      password: formData.get("password"),
      redirectTo: formData.get("redirectTo"),
    });
    const unlockRateLimit = checkRateLimit({
      key: `gallery-unlock:${clientIp}:${parsed.slug}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!unlockRateLimit.allowed) {
      return rateLimitRedirectResponse(request, `/g/${parsed.slug}`, unlockRateLimit.retryAfterSeconds);
    }

    const shareLink = await prisma.galleryShareLink.findUnique({
      where: { slug: parsed.slug },
      select: {
        slug: true,
        isActive: true,
        expiresAt: true,
        passwordHash: true,
      },
    });

    if (!shareLink || !shareLink.isActive) {
      return redirectToGallery(request, parsed.slug, "not_found");
    }

    if (shareLink.expiresAt && shareLink.expiresAt.getTime() < Date.now()) {
      return redirectToGallery(request, parsed.slug, "expired");
    }

    if (!shareLink.passwordHash) {
      return redirectToGallery(request, parsed.slug, "not_protected");
    }

    const passwordMatches = await bcrypt.compare(parsed.password, shareLink.passwordHash);

    if (!passwordMatches) {
      return redirectToGallery(request, parsed.slug, "invalid_password");
    }

    const token = await createGalleryAccessToken(parsed.slug);

    const response = NextResponse.redirect(new URL(parsed.redirectTo || `/g/${parsed.slug}`, request.url), 303);

    response.cookies.set({
      name: getGalleryAccessCookieName(),
      value: token,
      ...getSecureCookieOptions(getGalleryAccessMaxAgeSeconds()),
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid unlock payload.", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to unlock gallery." }, { status: 500 });
  }
}
