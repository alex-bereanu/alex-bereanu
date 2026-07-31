import { NextResponse } from "next/server";

import { requireAdminRequestSession } from "@/server/auth/admin-guard";

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  return NextResponse.json(
    { error: "Archive relay uploads are disabled to protect server memory. Retry the resumable direct upload." },
    { status: 413 },
  );
}
