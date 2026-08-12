import { NextRequest, NextResponse } from "next/server";

import { env } from "@/config/env";
import { getCanonicalRedirect, isWeddingHost } from "@/lib/seo";

const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_SETUP_PATH = "/admin/setup";
const ADMIN_SESSION_COOKIE = env.NODE_ENV === "production" ? "__Host-admin_session" : "admin_session";

function getOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function uniqueSources(sources: Array<string | null>): string[] {
  return [...new Set(sources.filter((source): source is string => Boolean(source)))];
}

function buildContentSecurityPolicy(): string {
  const publicAssetOrigin = getOrigin(env.R2_PUBLIC_BASE_URL);
  const r2ApiOrigin = env.R2_ACCOUNT_ID
    ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : null;
  const scriptSources = ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"];

  if (env.NODE_ENV !== "production") scriptSources.push("'unsafe-eval'");

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "script-src-attr 'none'",
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    `img-src ${uniqueSources(["'self'", "data:", "blob:", publicAssetOrigin]).join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${uniqueSources(["'self'", "https://challenges.cloudflare.com", r2ApiOrigin]).join(" ")}`,
    "frame-src https://challenges.cloudflare.com",
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "report-uri /api/security/csp-report",
  ];

  if (env.NODE_ENV === "production") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Cross-Origin-Resource-Policy": "same-site",
  "Origin-Agent-Cluster": "?1",
  "Content-Security-Policy": buildContentSecurityPolicy(),
};

function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  if (env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

function withPrivateHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Vary", "Cookie");
  return response;
}

function normalizeHost(hostHeader: string | null): string {
  if (!hostHeader) return "";
  return hostHeader.split(":")[0]?.toLowerCase() ?? "";
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = normalizeHost(forwardedHost ?? request.headers.get("host"));
  const canonicalRedirect = getCanonicalRedirect({
    host,
    pathname,
    search: request.nextUrl.search,
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    weddingsUrl: env.NEXT_PUBLIC_WEDDINGS_URL,
  });

  if (canonicalRedirect) {
    return withSecurityHeaders(NextResponse.redirect(canonicalRedirect, 308));
  }

  const requestUsesWeddingHost = env.NEXT_PUBLIC_WEDDINGS_URL
    ? isWeddingHost(host, env.NEXT_PUBLIC_WEDDINGS_URL)
    : Boolean(env.WEDDINGS_DOMAIN && host === env.WEDDINGS_DOMAIN.toLowerCase());

  if (requestUsesWeddingHost && pathname === "/") {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/weddings";
    return withSecurityHeaders(NextResponse.rewrite(rewriteUrl));
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const isPrivatePath =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/g/") ||
    pathname.startsWith("/api/gallery-access") ||
    pathname.startsWith("/api/gallery-media") ||
    pathname.startsWith("/api/galleries/") ||
    pathname.startsWith("/api/internal/");

  const finalizeResponse = (response: NextResponse) => {
    const securedResponse = withSecurityHeaders(response);
    return isPrivatePath ? withPrivateHeaders(securedResponse) : securedResponse;
  };

  if (pathname.startsWith("/admin") && pathname !== ADMIN_LOGIN_PATH && pathname !== ADMIN_SETUP_PATH) {
    if (!token) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = ADMIN_LOGIN_PATH;
      redirectUrl.searchParams.set("next", pathname);
      return finalizeResponse(NextResponse.redirect(redirectUrl));
    }
  }

  return finalizeResponse(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
