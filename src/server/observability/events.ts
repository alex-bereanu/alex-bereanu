import "server-only";

import { env } from "@/config/env";

type OperationalEvent = {
  kind: "client-delivery" | "csp-violation" | "maintenance" | "server-error" | "web-vital";
  severity: "info" | "warning" | "error";
  data: Record<string, string | number | boolean | null | undefined>;
};

export async function emitOperationalEvent(event: OperationalEvent): Promise<boolean> {
  if (!env.OBSERVABILITY_WEBHOOK_URL) return false;

  try {
    const response = await fetch(env.OBSERVABILITY_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.OBSERVABILITY_WEBHOOK_SECRET
          ? { Authorization: `Bearer ${env.OBSERVABILITY_WEBHOOK_SECRET}` }
          : {}),
      },
      body: JSON.stringify({
        service: "alex-bereanu-photography",
        environment: env.NODE_ENV,
        occurredAt: new Date().toISOString(),
        ...event,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    console.error("Operational event delivery failed.", { kind: event.kind });
    return false;
  }
}
