import { NextResponse } from "next/server";

import {
  getAdminSessionCookieName,
  revokeAdminSessionToken,
} from "@/server/auth/admin-session";
import { getSecureCookieOptions } from "@/server/auth/cookies";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData().catch(() => null);
  const securityError = verifyMutationProtection(request, String(formData?.get("csrfToken") ?? ""));

  if (securityError) {
    return securityError;
  }

  const response = NextResponse.json({ ok: true });
  const sessionToken = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${getAdminSessionCookieName()}=`))
    ?.slice(getAdminSessionCookieName().length + 1);

  let decodedSessionToken: string | null = null;

  if (sessionToken) {
    try {
      decodedSessionToken = decodeURIComponent(sessionToken);
    } catch {
      decodedSessionToken = sessionToken;
    }
  }

  await revokeAdminSessionToken(decodedSessionToken);
  await recordSecurityAuditEvent({
    eventType: "admin.logout",
    outcome: "SUCCESS",
    clientIp: getClientIp(request),
    metadata: { session_present: Boolean(decodedSessionToken) },
  });

  response.cookies.set({
    name: getAdminSessionCookieName(),
    value: "",
    ...getSecureCookieOptions(0),
  });

  return response;
}
