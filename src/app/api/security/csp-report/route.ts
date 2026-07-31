import { NextResponse } from "next/server";
import { z } from "zod";

import { emitOperationalEvent } from "@/server/observability/events";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { buildRateLimitKey, checkRateLimit, getClientIp } from "@/server/security/rate-limit";

const reportSchema = z.object({
  "csp-report": z.object({
    "effective-directive": z.string().max(120).optional(),
    "violated-directive": z.string().max(120).optional(),
    "blocked-uri": z.string().max(2_048).optional(),
  }),
});

function safeOrigin(value: string | undefined): string {
  if (!value) return "unknown";
  if (["inline", "eval", "data", "blob"].includes(value)) return value;
  try {
    return new URL(value).origin;
  } catch {
    return "invalid";
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) return new NextResponse(null, { status: 413 });

  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey("csp-report", request),
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) return new NextResponse(null, { status: 204 });

  const payload = await request.json().catch(() => null);
  const parsed = reportSchema.safeParse(payload);
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const report = parsed.data["csp-report"];
  const directive = report["effective-directive"] ?? report["violated-directive"] ?? "unknown";
  const blockedOrigin = safeOrigin(report["blocked-uri"]);

  await Promise.all([
    recordSecurityAuditEvent({
      eventType: "csp.violation",
      outcome: "DENIED",
      clientIp: getClientIp(request),
      metadata: { directive, blocked_origin: blockedOrigin },
    }),
    emitOperationalEvent({
      kind: "csp-violation",
      severity: "warning",
      data: { directive, blockedOrigin },
    }),
  ]);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
