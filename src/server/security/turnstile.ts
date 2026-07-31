import "server-only";

import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import type { TurnstileAction } from "@/lib/turnstile";
import { getClientIp } from "@/server/security/rate-limit";
import { recordSecurityAuditEvent } from "@/server/security/audit";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = /^[a-z0-9_-]{1,32}$/i;

const turnstileResponseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

export function isTurnstileEnabled(): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY);
}

function expectedHostnames(request: Request): Set<string> {
  const configured = env.TURNSTILE_EXPECTED_HOSTNAMES
    ?.split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);

  if (configured && configured.length > 0) return new Set(configured);
  return env.NODE_ENV === "production" ? new Set() : new Set([new URL(request.url).hostname.toLowerCase()]);
}

async function denied(request: Request, action: TurnstileAction, reason: string, status = 400): Promise<NextResponse> {
  await recordSecurityAuditEvent({
    eventType: "turnstile.verify",
    outcome: "DENIED",
    clientIp: getClientIp(request),
    metadata: { action, reason },
  });
  return NextResponse.json({ error: "Verification challenge failed. Please try again." }, { status });
}

export async function verifyTurnstileToken(
  request: Request,
  token: string | null | undefined,
  expectedAction: TurnstileAction,
): Promise<NextResponse | null> {
  if (!TURNSTILE_ACTION.test(expectedAction)) return denied(request, expectedAction, "invalid_expected_action", 500);

  if (!env.TURNSTILE_SECRET_KEY) {
    if (env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Bot protection is not configured." }, { status: 503 });
    }
    return null;
  }

  const allowedHostnames = expectedHostnames(request);
  if (allowedHostnames.size === 0) {
    return NextResponse.json({ error: "Bot protection hostname policy is not configured." }, { status: 503 });
  }

  if (!token || token.length > 2048) return denied(request, expectedAction, "missing_or_oversized_token");

  let verifyResponse: Response;
  try {
    verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: getClientIp(request) === "unknown" ? "" : getClientIp(request),
        idempotency_key: randomUUID(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return denied(request, expectedAction, "provider_unavailable", 503);
  }

  const payload = (await verifyResponse.json().catch(() => null)) as unknown;
  const parsedPayload = turnstileResponseSchema.safeParse(payload);
  if (!verifyResponse.ok || !parsedPayload.success || !parsedPayload.data.success) {
    return denied(request, expectedAction, "provider_rejected");
  }

  const result = parsedPayload.data;
  if (result.action !== expectedAction) return denied(request, expectedAction, "action_mismatch");
  if (!result.hostname || !allowedHostnames.has(result.hostname.toLowerCase())) {
    return denied(request, expectedAction, "hostname_mismatch");
  }

  return null;
}
