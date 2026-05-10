import { NextResponse } from "next/server";

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

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
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
