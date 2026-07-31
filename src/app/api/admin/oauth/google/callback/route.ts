import { NextRequest, NextResponse } from "next/server";

import {
  exchangeGoogleOAuthCodeForIdToken,
  getAdminGoogleOAuthStateCookieName,
  getExpiredAdminGoogleOAuthStateCookieOptions,
  getGoogleOAuthRedirectUri,
  isAdminGoogleEmailAllowed,
  sanitizeAdminNextPath,
  verifyAdminGoogleOAuthStateToken,
  verifyGoogleAdminIdToken,
} from "@/server/auth/admin-google-oauth";
import {
  createAdminSessionToken,
  getAdminSessionCookieName,
  getAdminSessionMaxAgeSeconds,
} from "@/server/auth/admin-session";
import { getSecureCookieOptions } from "@/server/auth/cookies";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";

function redirectToAdminLogin(requestUrl: string, error: string, nextPath = "/admin"): NextResponse {
  const loginUrl = new URL("/admin/login", requestUrl);
  loginUrl.searchParams.set("error", error);
  loginUrl.searchParams.set("next", sanitizeAdminNextPath(nextPath));

  const response = NextResponse.redirect(loginUrl);
  response.cookies.set({
    name: getAdminGoogleOAuthStateCookieName(),
    value: "",
    ...getExpiredAdminGoogleOAuthStateCookieOptions(),
  });

  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request);
  const requestUrl = new URL(request.url);
  const callbackError = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");
  const returnedState = requestUrl.searchParams.get("state");
  const stateCookie = request.cookies.get(getAdminGoogleOAuthStateCookieName())?.value;

  if (callbackError) {
    await recordSecurityAuditEvent({
      eventType: "admin.oauth",
      outcome: callbackError === "access_denied" ? "DENIED" : "FAILURE",
      clientIp,
      metadata: { provider: "google", reason: "provider_callback_error" },
    });
    return redirectToAdminLogin(
      request.url,
      callbackError === "access_denied" ? "google_oauth_cancelled" : "google_oauth_failed",
    );
  }

  if (!code || !returnedState || !stateCookie) {
    await recordSecurityAuditEvent({ eventType: "admin.oauth", outcome: "FAILURE", clientIp, metadata: { provider: "google", reason: "missing_state" } });
    return redirectToAdminLogin(request.url, "google_oauth_failed");
  }

  const verifiedState = await verifyAdminGoogleOAuthStateToken(stateCookie);

  if (!verifiedState || verifiedState.state !== returnedState) {
    await recordSecurityAuditEvent({ eventType: "admin.oauth", outcome: "DENIED", clientIp, metadata: { provider: "google", reason: "state_mismatch" } });
    return redirectToAdminLogin(request.url, "google_oauth_failed");
  }

  try {
    const idToken = await exchangeGoogleOAuthCodeForIdToken({
      code,
      codeVerifier: verifiedState.codeVerifier,
      redirectUri: getGoogleOAuthRedirectUri(request.url),
    });
    const googleProfile = await verifyGoogleAdminIdToken(idToken, verifiedState.nonce);

    if (!googleProfile) {
      await recordSecurityAuditEvent({ eventType: "admin.oauth", outcome: "FAILURE", clientIp, metadata: { provider: "google", reason: "invalid_profile" } });
      return redirectToAdminLogin(request.url, "google_oauth_failed", verifiedState.nextPath);
    }

    if (!isAdminGoogleEmailAllowed(googleProfile.email)) {
      await recordSecurityAuditEvent({
        eventType: "admin.oauth",
        outcome: "DENIED",
        actor: googleProfile.email,
        clientIp,
        metadata: { provider: "google", reason: "email_not_allowed" },
      });
      return redirectToAdminLogin(request.url, "google_oauth_unauthorized", verifiedState.nextPath);
    }

    const sessionToken = await createAdminSessionToken(
      `google:${googleProfile.subject}:${googleProfile.email}`,
      "google",
    );
    const response = NextResponse.redirect(new URL(verifiedState.nextPath, request.url));

    response.cookies.set({
      name: getAdminSessionCookieName(),
      value: sessionToken,
      ...getSecureCookieOptions(getAdminSessionMaxAgeSeconds()),
    });
    response.cookies.set({
      name: getAdminGoogleOAuthStateCookieName(),
      value: "",
      ...getExpiredAdminGoogleOAuthStateCookieOptions(),
    });

    await recordSecurityAuditEvent({
      eventType: "admin.oauth",
      outcome: "SUCCESS",
      actor: `google:${googleProfile.subject}:${googleProfile.email}`,
      clientIp,
      metadata: { provider: "google" },
    });

    return response;
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error("Unable to complete Google admin OAuth flow.", { errorName });
    await recordSecurityAuditEvent({ eventType: "admin.oauth", outcome: "ERROR", clientIp, metadata: { provider: "google", reason: errorName } });
    return redirectToAdminLogin(request.url, "google_oauth_failed", verifiedState.nextPath);
  }
}
