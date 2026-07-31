import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { NextResponse } from "next/server";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterSeconds: number };

const buckets = new Map<string, RateLimitRecord>();

function validForwardedIp(value: string | null): string | null {
  const candidate = value?.split(",")[0]?.trim();
  return candidate && isIP(candidate) !== 0 ? candidate : null;
}

export function getClientIp(request: Request): string {
  if (env.VERCEL === "1") {
    return validForwardedIp(request.headers.get("x-vercel-forwarded-for")) ?? "unknown";
  }

  return env.NODE_ENV === "development"
    ? validForwardedIp(request.headers.get("x-real-ip")) ?? "unknown"
    : "unknown";
}

export function buildRateLimitKey(scope: string, request: Request, discriminator?: string): string {
  const secret = env.RATE_LIMIT_SECRET ?? env.CSRF_SECRET ?? "development-rate-limit-key";
  const clientIdentity = getClientIp(request);
  const digest = createHmac("sha256", secret)
    .update(`${clientIdentity}\n${discriminator ?? ""}`)
    .digest("hex");
  return `${scope}:${digest}`;
}

function pruneExpiredBuckets(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, record] of buckets.entries()) {
    if (record.resetAt <= now) buckets.delete(key);
  }
}

function checkMemoryRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  pruneExpiredBuckets(now);
  const existingRecord = buckets.get(key);

  if (!existingRecord || existingRecord.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(limit - 1, 0), resetAt };
  }

  if (existingRecord.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existingRecord.resetAt,
      retryAfterSeconds: Math.max(Math.ceil((existingRecord.resetAt - now) / 1000), 1),
    };
  }

  existingRecord.count += 1;
  return { allowed: true, remaining: Math.max(limit - existingRecord.count, 0), resetAt: existingRecord.resetAt };
}

async function checkDatabaseRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const resetAt = new Date(Date.now() + options.windowMs);
  const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${options.key}, 1, ${resetAt}, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= CURRENT_TIMESTAMP THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= CURRENT_TIMESTAMP THEN ${resetAt}
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "count", "resetAt"
  `;
  const record = rows[0];
  if (!record) throw new Error("rate_limit_write_missing");

  if (record.count > options.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt.getTime(),
      retryAfterSeconds: Math.max(Math.ceil((record.resetAt.getTime() - Date.now()) / 1000), 1),
    };
  }

  return { allowed: true, remaining: Math.max(options.limit - record.count, 0), resetAt: record.resetAt.getTime() };
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  if (!env.DATABASE_URL) {
    if (env.NODE_ENV === "production") {
      return { allowed: false, remaining: 0, resetAt: Date.now() + 60_000, retryAfterSeconds: 60 };
    }
    return checkMemoryRateLimit(options);
  }

  try {
    return await checkDatabaseRateLimit(options);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error("Distributed rate limiter unavailable.", { errorName });
    if (env.NODE_ENV === "production") {
      return { allowed: false, remaining: 0, resetAt: Date.now() + 60_000, retryAfterSeconds: 60 };
    }
    return checkMemoryRateLimit(options);
  }
}

export function rateLimitJsonResponse(message: string, retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "private, no-store" } },
  );
}

export function rateLimitRedirectResponse(request: Request, path: string, retryAfterSeconds: number): NextResponse {
  const url = new URL(path, request.url);
  url.searchParams.set("error", "rate_limited");
  return NextResponse.redirect(url, {
    status: 303,
    headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "private, no-store" },
  });
}
