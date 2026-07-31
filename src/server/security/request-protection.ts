import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/config/env";

const CSRF_TOKEN_MAX_AGE_SECONDS = 2 * 60 * 60;
const CSRF_TOKEN_VERSION = "v1";
const CSRF_HEADER = "x-csrf-token";

function getCsrfSecret(): string {
  if (env.CSRF_SECRET) {
    return env.CSRF_SECRET;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("Missing required environment variable: CSRF_SECRET");
  }

  return "development-only-csrf-secret-change-before-production";
}

function signCsrfToken(timestamp: string, nonce: string): string {
  return createHmac("sha256", getCsrfSecret())
    .update(`${CSRF_TOKEN_VERSION}.${timestamp}.${nonce}`)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createCsrfToken(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(24).toString("base64url");
  const signature = signCsrfToken(timestamp, nonce);

  return `${CSRF_TOKEN_VERSION}.${timestamp}.${nonce}.${signature}`;
}

export function verifyCsrfToken(token: string | null | undefined): boolean {
  if (!token) {
    return false;
  }

  const [version, timestamp, nonce, signature] = token.split(".");

  if (version !== CSRF_TOKEN_VERSION || !timestamp || !nonce || !signature) {
    return false;
  }

  const issuedAtSeconds = Number(timestamp);

  if (!Number.isFinite(issuedAtSeconds)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (issuedAtSeconds > nowSeconds + 60 || nowSeconds - issuedAtSeconds > CSRF_TOKEN_MAX_AGE_SECONDS) {
    return false;
  }

  return safeEqual(signature, signCsrfToken(timestamp, nonce));
}

function originFromUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(request: Request): Set<string> {
  const requestOrigin = new URL(request.url).origin;
  const allowedOrigins = new Set<string>([requestOrigin]);

  for (const configuredUrl of [env.NEXT_PUBLIC_SITE_URL, env.NEXT_PUBLIC_WEDDINGS_URL, env.ADMIN_PANEL_BASE_URL]) {
    const origin = originFromUrl(configuredUrl);

    if (origin) {
      allowedOrigins.add(origin);
    }
  }

  return allowedOrigins;
}

export function verifySameOriginRequest(request: Request): boolean {
  const allowedOrigins = getAllowedOrigins(request);
  const originHeader = request.headers.get("origin");

  if (originHeader) {
    return allowedOrigins.has(originHeader);
  }

  const refererOrigin = originFromUrl(request.headers.get("referer") ?? undefined);

  if (refererOrigin) {
    return allowedOrigins.has(refererOrigin);
  }

  return env.NODE_ENV !== "production";
}

export function getCsrfTokenFromRequest(request: Request): string | null {
  return request.headers.get(CSRF_HEADER);
}

export function verifyMutationProtection(request: Request, csrfToken: string | null | undefined): NextResponse | null {
  if (!verifySameOriginRequest(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  if (!verifyCsrfToken(csrfToken ?? getCsrfTokenFromRequest(request))) {
    return NextResponse.json({ error: "Invalid security token. Please reload and try again." }, { status: 403 });
  }

  return null;
}

export function sanitizeSameOriginPath(value: string | null | undefined, fallbackPath: string, requestUrl: string): string {
  if (!value) {
    return fallbackPath;
  }

  try {
    const parsed = new URL(value, requestUrl);
    const requestOrigin = new URL(requestUrl).origin;

    if (parsed.origin !== requestOrigin) {
      return fallbackPath;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallbackPath;
  }
}
