import { NextResponse } from "next/server";

import { isInternalRequestAuthorized } from "@/server/security/internal-auth";
import { runMediaProcessingQueue } from "@/server/services/media-processing";
import { reconcileExpiredUploadSessions } from "@/server/services/media-upload-sessions";
import { invalidatePublicGalleryCache } from "@/server/services/public-cache";

export const runtime = "nodejs";
export const maxDuration = 300;

async function run(request: Request): Promise<NextResponse> {
  if (!isInternalRequestAuthorized(request, ["media-worker", "cron"])) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 2);
  const result = await runMediaProcessingQueue(Number.isInteger(requestedLimit) ? requestedLimit : 2);
  if (result.processed > 0) invalidatePublicGalleryCache();
  const reconciledUploads = await reconcileExpiredUploadSessions(100);
  return NextResponse.json({ ok: true, ...result, reconciledUploads }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = run;
export const POST = run;
