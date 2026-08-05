import { NextResponse } from "next/server";
import { z } from "zod";

import { emitOperationalEvent } from "@/server/observability/events";
import { buildRateLimitKey, checkRateLimit } from "@/server/security/rate-limit";

const eventSchema = z.object({
  event: z.enum(["prepare_cancelled", "prepare_failed", "share_failed", "save_fallback_used"]),
  network: z.enum(["online", "offline", "unknown"]),
  surface: z.enum(["grid", "list"]),
});

export async function POST(request: Request): Promise<NextResponse> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_048) return new NextResponse(null, { status: 413 });

  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey("client-delivery-telemetry", request),
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) return new NextResponse(null, { status: 204 });

  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  await emitOperationalEvent({
    kind: "client-delivery",
    severity: parsed.data.event.endsWith("failed") ? "warning" : "info",
    data: { routeGroup: "/g/[private]", ...parsed.data },
  });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
