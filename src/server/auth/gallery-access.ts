import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

import { env, requireEnv } from "@/config/env";

const GALLERY_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 2;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ISSUER = "alex-bereanu-photography";
const AUDIENCE = "private-gallery";

const galleryAccessClaimsSchema = z.object({
  sub: z.string().min(1),
  scope: z.literal("gallery"),
  grantVersion: z.number().int().positive(),
});

export type GalleryAccessClaims = z.infer<typeof galleryAccessClaimsSchema>;

function getSecret(): Uint8Array {
  return new TextEncoder().encode(requireEnv("GALLERY_ACCESS_SECRET"));
}

export function getGalleryAccessCookieName(): string {
  return env.NODE_ENV === "production" ? "__Host-gallery_access" : "gallery_access";
}

export function getGalleryAccessMaxAgeSeconds(): number {
  return GALLERY_ACCESS_MAX_AGE_SECONDS;
}

export function isGalleryCapabilityToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function hashGalleryCapabilityToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createGalleryShareCapability(): {
  token: string;
  tokenHash: string;
  internalLabel: string;
} {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashGalleryCapabilityToken(token);

  return {
    token,
    tokenHash,
    internalLabel: `share-${tokenHash.slice(0, 16)}`,
  };
}

export async function createGalleryAccessToken(input: {
  shareLinkId: string;
  grantVersion: number;
}): Promise<string> {
  return new SignJWT({
    scope: "gallery",
    grantVersion: input.grantVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.shareLinkId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${GALLERY_ACCESS_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyGalleryAccessToken(token: string): Promise<GalleryAccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const parsed = galleryAccessClaimsSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
