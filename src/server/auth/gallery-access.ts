import { SignJWT, jwtVerify } from "jose";

import { requireEnv } from "@/config/env";

const GALLERY_ACCESS_COOKIE = "gallery_access";
const GALLERY_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getSecret(): Uint8Array {
  return new TextEncoder().encode(requireEnv("ADMIN_SESSION_SECRET"));
}

export function getGalleryAccessCookieName(): string {
  return GALLERY_ACCESS_COOKIE;
}

export function getGalleryAccessMaxAgeSeconds(): number {
  return GALLERY_ACCESS_MAX_AGE_SECONDS;
}

export async function createGalleryAccessToken(slug: string): Promise<string> {
  return new SignJWT({ scope: "gallery" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(slug)
    .setIssuedAt()
    .setExpirationTime(`${GALLERY_ACCESS_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyGalleryAccessToken(token: string, slug: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.scope === "gallery" && payload.sub === slug;
  } catch {
    return false;
  }
}
