import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isInternalRequestAuthorized } from "@/server/security/internal-auth";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const headers = { "Cache-Control": "private, no-store" };

  if (!deep) {
    return NextResponse.json({ status: "ok" }, { headers });
  }

  if (!isInternalRequestAuthorized(request, ["health"])) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    const [failedMediaJobs, pendingDeletionJobs, rateLimitBuckets, auditEvents] = await Promise.all([
      prisma.mediaProcessingJob.count({ where: { status: "FAILED" } }),
      prisma.storageDeletionJob.count({ where: { status: "PENDING" } }),
      prisma.rateLimitBucket.count(),
      prisma.securityAuditEvent.count(),
    ]);
    const degraded = failedMediaJobs > 0 || pendingDeletionJobs > 25;

    return NextResponse.json(
      {
        status: degraded ? "degraded" : "ok",
        checks: { database: "ok", phase5Schema: "ok", failedMediaJobs, pendingDeletionJobs, rateLimitBuckets, auditEvents },
      },
      { status: degraded ? 503 : 200, headers },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", checks: { database: "failed" } },
      { status: 503, headers },
    );
  }
}
