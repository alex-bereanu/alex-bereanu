import { NextResponse } from "next/server";

import { isInternalRequestAuthorized } from "@/server/security/internal-auth";
import { runOperationalMaintenance } from "@/server/services/operational-maintenance";

export const runtime = "nodejs";
export const maxDuration = 300;

async function run(request: Request): Promise<NextResponse> {
  if (!isInternalRequestAuthorized(request, ["cron", "media-worker"])) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const result = await runOperationalMaintenance();
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = run;
export const POST = run;
