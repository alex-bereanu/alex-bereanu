import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { getAdminSessionCookieName, verifyAdminSessionToken } from "@/server/auth/admin-session";

function buildAdminLoginPath(nextPath: string): string {
  const params = new URLSearchParams({ next: nextPath });
  return `/admin/login?${params.toString()}`;
}

function readCookieFromHeader(cookieHeader: string | null, cookieName: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const segments = cookieHeader.split(";");

  for (const segment of segments) {
    const [name, ...valueParts] = segment.trim().split("=");

    if (name !== cookieName) {
      continue;
    }

    const value = valueParts.join("=");

    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

export async function requireAdminPageSession(nextPath = "/admin"): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAdminSessionCookieName())?.value;

  if (!token) {
    redirect(buildAdminLoginPath(nextPath));
  }

  const session = await verifyAdminSessionToken(token);

  if (!session) {
    redirect(buildAdminLoginPath(nextPath));
  }
}

export async function requireAdminRequestSession(request: Request): Promise<NextResponse | null> {
  const requestUrl = new URL(request.url);
  const nextPath = `${requestUrl.pathname}${requestUrl.search}`;
  const redirectUrl = new URL(requestUrl.toString());

  redirectUrl.pathname = "/admin/login";
  redirectUrl.searchParams.set("next", nextPath);

  const token = readCookieFromHeader(request.headers.get("cookie"), getAdminSessionCookieName());

  if (!token) {
    return NextResponse.redirect(redirectUrl, 303);
  }

  const session = await verifyAdminSessionToken(token);

  if (!session) {
    return NextResponse.redirect(redirectUrl, 303);
  }

  return null;
}