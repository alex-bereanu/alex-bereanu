import { NextResponse } from "next/server";

import { getAdminSessionCookieName } from "@/server/auth/admin-session";
import { getSecureCookieOptions } from "@/server/auth/cookies";
import { verifyMutationProtection } from "@/server/security/request-protection";

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData().catch(() => null);
  const securityError = verifyMutationProtection(request, String(formData?.get("csrfToken") ?? ""));

  if (securityError) {
    return securityError;
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: getAdminSessionCookieName(),
    value: "",
    ...getSecureCookieOptions(0),
  });

  return response;
}
