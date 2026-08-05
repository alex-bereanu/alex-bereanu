import { NextResponse } from "next/server";

import {
  buildGoogleOAuthAuthorizationUrl,
  createAdminGoogleOAuthStateToken,
  createGoogleOAuthProof,
  getAdminGoogleOAuthStateCookieName,
  getAdminGoogleOAuthStateCookieOptions,
  isAdminGoogleOAuthConfigured,
  sanitizeAdminNextPath,
} from "@/server/auth/admin-google-oauth";

function redirectToAdminLogin(requestUrl: string, error: string, nextPath: string): NextResponse {
  const loginUrl = new URL("/admin/login", requestUrl);
  loginUrl.searchParams.set("error", error);
  loginUrl.searchParams.set("next", nextPath);

  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const nextPath = sanitizeAdminNextPath(requestUrl.searchParams.get("next"));
  const stepUp = requestUrl.searchParams.get("stepup") === "1";

  if (!isAdminGoogleOAuthConfigured()) {
    return redirectToAdminLogin(request.url, "google_oauth_not_configured", nextPath);
  }

  try {
    const { state, nonce, codeVerifier, codeChallenge } = createGoogleOAuthProof();
    const stateToken = await createAdminGoogleOAuthStateToken({
      state,
      nonce,
      codeVerifier,
      nextPath,
      stepUp,
    });
    const authorizationUrl = buildGoogleOAuthAuthorizationUrl({
      requestUrl: request.url,
      state,
      nonce,
      codeChallenge,
      forceReauthentication: stepUp,
    });
    const response = NextResponse.redirect(authorizationUrl);

    response.cookies.set({
      name: getAdminGoogleOAuthStateCookieName(),
      value: stateToken,
      ...getAdminGoogleOAuthStateCookieOptions(),
    });

    return response;
  } catch (error) {
    console.error("Unable to start Google admin OAuth flow.", error);
    return redirectToAdminLogin(request.url, "google_oauth_failed", nextPath);
  }
}
