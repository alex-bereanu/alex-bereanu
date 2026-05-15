import { NextRequest, NextResponse } from "next/server";

import { env } from "@/config/env";
import { getAdminSessionCookieName, verifyAdminSessionToken } from "@/server/auth/admin-session";

const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_SETUP_PATH = "/admin/setup";
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  if (env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return response;
}

function normalizeHost(hostHeader: string | null): string {
  if (!hostHeader) {
    return "";
  }

  return hostHeader.split(":")[0]?.toLowerCase() ?? "";
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const host = normalizeHost(request.headers.get("host"));

  if (env.WEDDINGS_DOMAIN && host === env.WEDDINGS_DOMAIN.toLowerCase() && pathname === "/") {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/weddings";
    return withSecurityHeaders(NextResponse.rewrite(rewriteUrl));
  }

  const token = request.cookies.get(getAdminSessionCookieName())?.value;

  if (
    pathname.startsWith("/admin") &&
    pathname !== ADMIN_LOGIN_PATH &&
    pathname !== ADMIN_SETUP_PATH
  ) {
    if (!token) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = ADMIN_LOGIN_PATH;
      redirectUrl.searchParams.set("next", pathname);
      return withSecurityHeaders(NextResponse.redirect(redirectUrl));
    }

    const session = await verifyAdminSessionToken(token);

    if (!session) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = ADMIN_LOGIN_PATH;
      redirectUrl.searchParams.set("next", pathname);
      return withSecurityHeaders(NextResponse.redirect(redirectUrl));
    }
  }

  if ((pathname === ADMIN_LOGIN_PATH || pathname === ADMIN_SETUP_PATH) && token) {
    const session = await verifyAdminSessionToken(token);

    if (session) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/admin";
      redirectUrl.searchParams.delete("next");
      return withSecurityHeaders(NextResponse.redirect(redirectUrl));
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
