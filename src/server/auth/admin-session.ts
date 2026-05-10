import { SignJWT, jwtVerify } from "jose";

import { env, requireEnv } from "@/config/env";

const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

type AdminSessionClaims = {
  sub: string;
  role: "admin";
};

function getSessionSecret(): Uint8Array {
  return new TextEncoder().encode(requireEnv("ADMIN_SESSION_SECRET"));
}

export function getAdminSessionCookieName(): string {
  return ADMIN_SESSION_COOKIE;
}

export function getAdminSessionMaxAgeSeconds(): number {
  return ADMIN_SESSION_MAX_AGE_SECONDS;
}

export async function createAdminSessionToken(username: string): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function verifyAdminSessionToken(
  token: string,
): Promise<AdminSessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());

    if (payload.sub && payload.role === "admin") {
      return {
        sub: payload.sub,
        role: "admin",
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function isAdminSessionConfigured(): boolean {
  return Boolean(env.ADMIN_SESSION_SECRET);
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(env.ADMIN_USERNAME && (env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD_PLAIN) && isAdminSessionConfigured());
}