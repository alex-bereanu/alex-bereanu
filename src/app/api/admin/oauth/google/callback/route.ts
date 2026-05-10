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
  const requestUrl = new URL(request.url);
  const callbackError = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");
  const returnedState = requestUrl.searchParams.get("state");
  const stateCookie = request.cookies.get(getAdminGoogleOAuthStateCookieName())?.value;

  if (callbackError) {
    return redirectToAdminLogin(
      request.url,
      callbackError === "access_denied" ? "google_oauth_cancelled" : "google_oauth_failed",
    );
  }

  if (!code || !returnedState || !stateCookie) {
    return redirectToAdminLogin(request.url, "google_oauth_failed");
  }

  const verifiedState = await verifyAdminGoogleOAuthStateToken(stateCookie);

  if (!verifiedState || verifiedState.state !== returnedState) {
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
      return redirectToAdminLogin(request.url, "google_oauth_failed", verifiedState.nextPath);
    }

    if (!isAdminGoogleEmailAllowed(googleProfile.email)) {
      return redirectToAdminLogin(request.url, "google_oauth_unauthorized", verifiedState.nextPath);
    }

    const sessionToken = await createAdminSessionToken(`google:${googleProfile.subject}`);
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

    return response;
  } catch (error) {
    console.error("Unable to complete Google admin OAuth flow.", error);
    return redirectToAdminLogin(request.url, "google_oauth_failed", verifiedState.nextPath);
  }
}
