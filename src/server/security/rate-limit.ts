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
let databaseRateLimitReady = false;

function pruneExpiredBuckets(now: number): void {
  if (buckets.size < 1000) {
    return;
  }

  for (const [key, record] of buckets.entries()) {
    if (record.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
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
  buckets.set(key, existingRecord);

  return {
    allowed: true,
    remaining: Math.max(limit - existingRecord.count, 0),
    resetAt: existingRecord.resetAt,
  };
}

async function ensureDatabaseRateLimitTable(): Promise<void> {
  if (databaseRateLimitReady) {
    return;
  }

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
      "key" TEXT PRIMARY KEY,
      "count" INTEGER NOT NULL,
      "resetAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
  databaseRateLimitReady = true;
}

async function checkDatabaseRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  await ensureDatabaseRateLimitTable();

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

  if (!record) {
    return checkMemoryRateLimit(options);
  }

  if (record.count > options.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt.getTime(),
      retryAfterSeconds: Math.max(Math.ceil((record.resetAt.getTime() - Date.now()) / 1000), 1),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(options.limit - record.count, 0),
    resetAt: record.resetAt.getTime(),
  };
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  if (!env.DATABASE_URL) {
    return checkMemoryRateLimit(options);
  }

  try {
    return await checkDatabaseRateLimit(options);
  } catch (error) {
    console.error("Database rate limit failed; falling back to in-memory limiter.", error);
    return checkMemoryRateLimit(options);
  }
}

export function rateLimitJsonResponse(message: string, retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export function rateLimitRedirectResponse(request: Request, path: string, retryAfterSeconds: number): NextResponse {
  const url = new URL(path, request.url);
  url.searchParams.set("error", "rate_limited");

  return NextResponse.redirect(url, {
    status: 303,
    headers: {
      "Retry-After": String(retryAfterSeconds),
    },
  });
}
