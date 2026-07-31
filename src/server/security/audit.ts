import "server-only";

import { createHmac } from "node:crypto";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";

type AuditMetadataValue = string | number | boolean | null;

export type SecurityAuditInput = {
  eventType: string;
  outcome: "SUCCESS" | "FAILURE" | "DENIED" | "ERROR";
  actor?: string | null;
  clientIp?: string | null;
  resourceType?: string;
  resourceId?: string | null;
  metadata?: Record<string, AuditMetadataValue>;
};

const SAFE_LABEL = /^[a-z0-9_.:-]{1,80}$/i;

function keyedHash(value: string): string | null {
  const secret = env.AUDIT_LOG_SECRET ?? env.CSRF_SECRET;
  if (!secret || !value || value === "unknown") return null;
  return createHmac("sha256", secret).update(value).digest("hex");
}

function sanitizeMetadata(metadata: SecurityAuditInput["metadata"]): Record<string, AuditMetadataValue> | undefined {
  if (!metadata) return undefined;
  const safeEntries: Array<[string, AuditMetadataValue]> = [];

  for (const [key, rawValue] of Object.entries(metadata).slice(0, 12)) {
    if (!SAFE_LABEL.test(key)) continue;
    const value = typeof rawValue === "string" ? rawValue.slice(0, 120) : rawValue;
    safeEntries.push([key, value]);
  }

  return safeEntries.length > 0 ? Object.fromEntries(safeEntries) : undefined;
}

export async function recordSecurityAuditEvent(input: SecurityAuditInput): Promise<void> {
  if (!env.DATABASE_URL || !SAFE_LABEL.test(input.eventType) || !SAFE_LABEL.test(input.outcome)) return;

  try {
    await prisma.securityAuditEvent.create({
      data: {
        eventType: input.eventType,
        outcome: input.outcome,
        actorHash: input.actor ? keyedHash(input.actor) : null,
        ipHash: input.clientIp ? keyedHash(input.clientIp) : null,
        resourceType: input.resourceType?.slice(0, 80),
        resourceId: input.resourceId?.slice(0, 120),
        metadata: sanitizeMetadata(input.metadata),
      },
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error("Security audit persistence failed.", { eventType: input.eventType, errorName });
  }
}
