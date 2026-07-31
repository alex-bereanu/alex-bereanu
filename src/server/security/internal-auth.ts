import "server-only";

import { timingSafeEqual } from "node:crypto";

import { env } from "@/config/env";

type InternalCredential = "cron" | "health" | "media-worker";

function credentialValue(credential: InternalCredential): string | undefined {
  if (credential === "cron") return env.CRON_SECRET;
  if (credential === "health") return env.HEALTH_CHECK_SECRET;
  return env.MEDIA_WORKER_SECRET;
}

export function isInternalRequestAuthorized(
  request: Request,
  acceptedCredentials: InternalCredential[],
): boolean {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided) return false;
  const providedBytes = Buffer.from(provided);

  return acceptedCredentials.some((credential) => {
    const expected = credentialValue(credential);
    if (!expected) return false;
    const expectedBytes = Buffer.from(expected);
    return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
  });
}
