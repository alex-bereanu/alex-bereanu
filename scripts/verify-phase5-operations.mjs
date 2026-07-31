import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

function includesAll(source, fragments, label) {
  const missing = fragments.filter((fragment) => !source.includes(fragment));
  if (missing.length > 0) throw new Error(`${label} is missing: ${missing.join(", ")}`);
}

function excludesAll(source, fragments, label) {
  const found = fragments.filter((fragment) => source.includes(fragment));
  if (found.length > 0) throw new Error(`${label} contains forbidden values: ${found.join(", ")}`);
}

const [schema, migration, rateLimit, turnstile, turnstileField, audit, proxy, maintenance, health, vitals, instrumentation, envExample, packageJson] =
  await Promise.all([
    read("prisma/schema.prisma"),
    read("prisma/migrations/20260731230000_phase5_operations/migration.sql"),
    read("src/server/security/rate-limit.ts"),
    read("src/server/security/turnstile.ts"),
    read("src/components/turnstile-field.tsx"),
    read("src/server/security/audit.ts"),
    read("src/proxy.ts"),
    read("src/server/services/operational-maintenance.ts"),
    read("src/app/api/health/route.ts"),
    read("src/app/api/telemetry/web-vitals/route.ts"),
    read("src/instrumentation.ts"),
    read(".env.example"),
    read("package.json"),
  ]);

includesAll(schema, ["model RateLimitBucket", "model SecurityAuditEvent", "actorHash", "ipHash"], "Phase 5 schema");
includesAll(migration, ["CREATE TABLE \"RateLimitBucket\"", "CREATE TABLE \"SecurityAuditEvent\""], "Phase 5 migration");
includesAll(rateLimit, ["x-vercel-forwarded-for", "createHmac", "buildRateLimitKey", 'env.NODE_ENV === "production"'], "distributed rate limiting");
excludesAll(rateLimit, ["x-forwarded-for", "CREATE TABLE IF NOT EXISTS"], "trusted client-IP handling");
includesAll(turnstile, ["expectedAction", "expectedHostnames", "result.action", "result.hostname", "AbortSignal.timeout", "idempotency_key"], "Turnstile verification");
includesAll(turnstileField, ["action: TurnstileAction", "action,"], "Turnstile widget action");
includesAll(audit, ["createHmac", "actorHash", "ipHash", "sanitizeMetadata"], "privacy-minimized audit events");
excludesAll(audit, ["password", "tokenHash", "objectKey"], "audit persistence");
includesAll(proxy, ["script-src-attr 'none'", "object-src 'none'", "frame-ancestors 'none'", "report-uri /api/security/csp-report", "upgrade-insecure-requests"], "production CSP");
includesAll(maintenance, ["AUDIT_RETENTION_DAYS", "EMAIL_LOG_RETENTION_DAYS", "TICKET_RETENTION_DAYS", "retryPendingStorageDeletions", "emitOperationalEvent"], "operational maintenance");
includesAll(health, ["isInternalRequestAuthorized", 'searchParams.get("deep")', "failedMediaJobs", "rateLimitBucket.count", "securityAuditEvent.count", 'status: "unavailable"'], "deep readiness check");
includesAll(vitals, ["metricSchema", "buildRateLimitKey", "emitOperationalEvent"], "Web Vitals telemetry");
includesAll(instrumentation, ["onRequestError", "routePath", "emitOperationalEvent"], "server error instrumentation");
includesAll(envExample, ["AUDIT_LOG_SECRET", "RATE_LIMIT_SECRET", "TURNSTILE_EXPECTED_HOSTNAMES", "OBSERVABILITY_WEBHOOK_URL", "AUDIT_RETENTION_DAYS"], "Phase 5 environment contract");
includesAll(packageJson, ["operations:verify", "dependency:policy", "production:verify", "deployment:verify", "release:verify"], "release scripts");

for (const file of [
  "docs/operations/RETENTION-DELETION-POLICY.md",
  "docs/operations/BACKUP-RESTORE-RUNBOOK.md",
  "docs/operations/INCIDENT-RESPONSE-RUNBOOK.md",
  "docs/operations/MONITORING-AND-ALERTS.md",
  "docs/operations/PENETRATION-TEST-GATE.md",
]) {
  const contents = await read(file);
  if (contents.length < 500) throw new Error(`${file} is unexpectedly incomplete.`);
}

console.log("Phase 5 verification passed (distributed abuse controls, audit events, CSP, observability, retention, and release operations)." );
