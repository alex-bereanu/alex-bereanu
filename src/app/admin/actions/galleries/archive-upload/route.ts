import { NextResponse } from "next/server";

import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { isAdminPhase6ReleaseEnabled } from "@/server/services/admin-phase6-release";

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (isAdminPhase6ReleaseEnabled()) {
    return NextResponse.json({ error: "Archive delivery is retired." }, { status: 404 });
  }

  return NextResponse.json(
    { error: "Archive relay uploads are disabled to protect server memory. Retry the resumable direct upload." },
    { status: 413 },
  );
}
