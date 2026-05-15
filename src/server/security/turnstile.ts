import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { getClientIp } from "@/server/security/rate-limit";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const turnstileResponseSchema = z.object({
  success: z.boolean(),
});

export function isTurnstileEnabled(): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstileToken(request: Request, token: string | null | undefined): Promise<NextResponse | null> {
  if (!env.TURNSTILE_SECRET_KEY) {
    if (env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Bot protection is not configured." }, { status: 503 });
    }

    return null;
  }

  if (!token) {
    return NextResponse.json({ error: "Please complete the verification challenge." }, { status: 400 });
  }

  const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: getClientIp(request),
    }),
    cache: "no-store",
  });
  const payload = (await verifyResponse.json().catch(() => null)) as unknown;
  const parsedPayload = turnstileResponseSchema.safeParse(payload);

  if (!verifyResponse.ok || !parsedPayload.success || !parsedPayload.data.success) {
    return NextResponse.json({ error: "Verification challenge failed. Please try again." }, { status: 400 });
  }

  return null;
}
