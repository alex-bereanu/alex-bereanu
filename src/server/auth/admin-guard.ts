import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { env } from "@/config/env";
import {
  getAdminSessionCookieName,
  type AdminSession,
  verifyAdminSessionToken,
} from "@/server/auth/admin-session";
import { isAdminGoogleOAuthConfigured } from "@/server/auth/admin-google-oauth";

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

type AdminRequestSessionCheck =
  | { response: NextResponse; session: null }
  | { response: null; session: AdminSession };

function adminReturnPath(request: Request): string {
  const requestUrl = new URL(request.url);
  const referer = request.headers.get("referer");
  if (!referer) return "/admin";

  try {
    const refererUrl = new URL(referer);
    const isAdminPage = refererUrl.pathname === "/admin" || refererUrl.pathname.startsWith("/admin/");
    if (refererUrl.origin !== requestUrl.origin || !isAdminPage || refererUrl.pathname.startsWith("/admin/actions/")) {
      return "/admin";
    }
    return `${refererUrl.pathname}${refererUrl.search}`;
  } catch {
    return "/admin";
  }
}

function loginRedirect(request: Request): NextResponse {
  const redirectUrl = new URL("/admin/login", request.url);
  redirectUrl.searchParams.set("next", adminReturnPath(request));
  return NextResponse.redirect(redirectUrl, 303);
}

export async function requireAdminRequestSessionDetails(request: Request): Promise<AdminRequestSessionCheck> {
  const token = readCookieFromHeader(request.headers.get("cookie"), getAdminSessionCookieName());
  if (!token) return { response: loginRedirect(request), session: null };

  const session = await verifyAdminSessionToken(token);
  return session ? { response: null, session } : { response: loginRedirect(request), session: null };
}

function buildStepUpUrl(request: Request, session: AdminSession): URL {
  const nextPath = adminReturnPath(request);
  const googleStepUp = session.provider === "google" && isAdminGoogleOAuthConfigured();
  const url = new URL(googleStepUp ? "/api/admin/oauth/google" : "/admin/login", request.url);
  url.searchParams.set("next", nextPath);
  url.searchParams.set("stepup", "1");
  if (!googleStepUp) url.searchParams.set("error", "step_up_required");
  return url;
}

export async function requireRecentAdminRequestSession(
  request: Request,
  responseMode: "redirect" | "json" = "redirect",
): Promise<AdminRequestSessionCheck> {
  const auth = await requireAdminRequestSessionDetails(request);
  if (auth.response) return auth;

  const maxAgeSeconds = env.ADMIN_STEP_UP_MAX_AGE_SECONDS ?? 10 * 60;
  if (Date.now() - auth.session.authenticatedAt.getTime() <= maxAgeSeconds * 1000) return auth;

  const reauthenticationUrl = buildStepUpUrl(request, auth.session);
  const response = responseMode === "json"
    ? NextResponse.json(
        { error: "Reauthentication is required before this irreversible action.", reauthenticationUrl: reauthenticationUrl.toString() },
        { status: 428, headers: { "Cache-Control": "private, no-store" } },
      )
    : NextResponse.redirect(reauthenticationUrl, 303);
  return { response, session: null };
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
  return (await requireAdminRequestSessionDetails(request)).response;
}
