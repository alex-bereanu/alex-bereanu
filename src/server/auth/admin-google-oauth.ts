import { createHash, randomBytes } from "node:crypto";

import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { env, requireEnv } from "@/config/env";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_OAUTH_STATE_COOKIE = "admin_google_oauth_state";
const GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
const GOOGLE_OAUTH_COOKIE_PATH = "/api/admin/oauth/google";

const oauthStateSchema = z.object({
  type: z.literal("admin_google_oauth"),
  state: z.string().min(1),
  nonce: z.string().min(1),
  codeVerifier: z.string().min(43),
  nextPath: z.string().min(1),
});

const googleTokenResponseSchema = z.object({
  id_token: z.string().min(1),
});

const googleIdTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean(),
  nonce: z.string().min(1),
});

type OAuthState = z.infer<typeof oauthStateSchema>;

export type VerifiedGoogleAdminProfile = {
  subject: string;
  email: string;
};

function getOAuthSecret(): Uint8Array {
  return new TextEncoder().encode(requireEnv("ADMIN_SESSION_SECRET"));
}

function randomBase64Url(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function getAdminGoogleOAuthStateCookieName(): string {
  return GOOGLE_OAUTH_STATE_COOKIE;
}

export function getAdminGoogleOAuthStateCookieOptions(maxAge = GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: GOOGLE_OAUTH_COOKIE_PATH,
    maxAge,
  };
}

export function getExpiredAdminGoogleOAuthStateCookieOptions() {
  return getAdminGoogleOAuthStateCookieOptions(0);
}

export function getAdminGoogleAllowedEmails(): string[] {
  return (env.ADMIN_GOOGLE_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminGoogleOAuthConfigured(): boolean {
  return Boolean(
    env.ADMIN_SESSION_SECRET &&
      env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      getAdminGoogleAllowedEmails().length > 0,
  );
}

export function isAdminGoogleEmailAllowed(email: string): boolean {
  return getAdminGoogleAllowedEmails().includes(email.trim().toLowerCase());
}

export function sanitizeAdminNextPath(value: string | null | undefined): string {
  const nextPath = value?.trim();

  if (!nextPath) {
    return "/admin";
  }

  if (nextPath === "/admin" || nextPath.startsWith("/admin/") || nextPath.startsWith("/admin?")) {
    return nextPath;
  }

  return "/admin";
}

export function createGoogleOAuthProof() {
  const codeVerifier = randomBase64Url();
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  return {
    state: randomBase64Url(),
    nonce: randomBase64Url(),
    codeVerifier,
    codeChallenge,
  };
}

export function getGoogleOAuthRedirectUri(requestUrl: string): string {
  const configuredRedirectUri = env.GOOGLE_OAUTH_REDIRECT_URI?.trim();

  if (configuredRedirectUri) {
    return configuredRedirectUri;
  }

  return new URL("/api/admin/oauth/google/callback", requestUrl).toString();
}

export function buildGoogleOAuthAuthorizationUrl({
  requestUrl,
  state,
  nonce,
  codeChallenge,
}: {
  requestUrl: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): URL {
  const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);

  authorizationUrl.searchParams.set("client_id", requireEnv("GOOGLE_OAUTH_CLIENT_ID"));
  authorizationUrl.searchParams.set("redirect_uri", getGoogleOAuthRedirectUri(requestUrl));
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("prompt", "select_account");

  return authorizationUrl;
}

export async function createAdminGoogleOAuthStateToken(input: Omit<OAuthState, "type">): Promise<string> {
  return new SignJWT({
    type: "admin_google_oauth",
    ...input,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS}s`)
    .sign(getOAuthSecret());
}

export async function verifyAdminGoogleOAuthStateToken(token: string): Promise<OAuthState | null> {
  try {
    const { payload } = await jwtVerify(token, getOAuthSecret());
    const parsedPayload = oauthStateSchema.safeParse(payload);

    if (!parsedPayload.success) {
      return null;
    }

    return parsedPayload.data;
  } catch {
    return null;
  }
}

export async function exchangeGoogleOAuthCodeForIdToken({
  code,
  codeVerifier,
  redirectUri,
}: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<string> {
  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });

  const tokenPayload = (await tokenResponse.json().catch(() => null)) as unknown;
  const parsedTokenPayload = googleTokenResponseSchema.safeParse(tokenPayload);

  if (!tokenResponse.ok || !parsedTokenPayload.success) {
    throw new Error("Google OAuth token exchange failed.");
  }

  return parsedTokenPayload.data.id_token;
}

export async function verifyGoogleAdminIdToken(
  idToken: string,
  expectedNonce: string,
): Promise<VerifiedGoogleAdminProfile | null> {
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      audience: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });
    const parsedClaims = googleIdTokenClaimsSchema.safeParse(payload);

    if (!parsedClaims.success || parsedClaims.data.nonce !== expectedNonce || !parsedClaims.data.email_verified) {
      return null;
    }

    return {
      subject: parsedClaims.data.sub,
      email: parsedClaims.data.email.toLowerCase(),
    };
  } catch {
    return null;
  }
}
