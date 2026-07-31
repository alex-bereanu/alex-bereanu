import { NextResponse } from "next/server";

import {
  createGalleryAccessToken,
  getGalleryAccessCookieName,
  getGalleryAccessMaxAgeSeconds,
} from "@/server/auth/gallery-access";
import { getSecureCookieOptions } from "@/server/auth/cookies";
import { resolvePasswordlessGalleryCapability } from "@/server/services/gallery-access";

type RouteProps = {
  params: Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteProps): Promise<NextResponse> {
  const { token } = await params;
  const shareLink = await resolvePasswordlessGalleryCapability(token);
  const galleryUrl = new URL(`/g/${encodeURIComponent(token)}`, request.url);

  if (!shareLink) {
    galleryUrl.searchParams.set("error", "not_found");
    return NextResponse.redirect(galleryUrl, 303);
  }

  const grant = await createGalleryAccessToken({
    shareLinkId: shareLink.id,
    grantVersion: shareLink.grantVersion,
  });
  const response = NextResponse.redirect(galleryUrl, 303);

  response.cookies.set({
    name: getGalleryAccessCookieName(),
    value: grant,
    ...getSecureCookieOptions(getGalleryAccessMaxAgeSeconds()),
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");

  return response;
}
