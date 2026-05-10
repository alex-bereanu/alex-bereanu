import { NextResponse } from "next/server";

import { getAdminSessionCookieName } from "@/server/auth/admin-session";
import { getSecureCookieOptions } from "@/server/auth/cookies";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: getAdminSessionCookieName(),
    value: "",
    ...getSecureCookieOptions(0),
  });

  return response;
}
