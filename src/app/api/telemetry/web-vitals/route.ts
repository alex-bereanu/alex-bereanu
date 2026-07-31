import { NextResponse } from "next/server";
import { z } from "zod";

import { emitOperationalEvent } from "@/server/observability/events";
import { buildRateLimitKey, checkRateLimit } from "@/server/security/rate-limit";

const metricSchema = z.object({
  name: z.enum(["CLS", "FCP", "FID", "INP", "LCP", "TTFB"]),
  value: z.number().finite().min(0).max(3_600_000),
  delta: z.number().finite().min(0).max(3_600_000),
  id: z.string().max(200),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  routeGroup: z.string().startsWith("/").max(120),
});

export async function POST(request: Request): Promise<NextResponse> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8_192) return new NextResponse(null, { status: 413 });

  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey("web-vitals", request),
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) return new NextResponse(null, { status: 204 });

  const payload = await request.json().catch(() => null);
  const parsed = metricSchema.safeParse(payload);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  await emitOperationalEvent({
    kind: "web-vital",
    severity: parsed.data.rating === "poor" ? "warning" : "info",
    data: parsed.data,
  });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
