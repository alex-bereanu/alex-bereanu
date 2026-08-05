#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const apply = process.argv.includes("--apply");
const initialKeys = new Set(Object.keys(process.env));

for (const envFileName of [".env", ".env.local", ".env.phase0.local", ".env.phase6.local"]) {
  const filePath = resolve(root, envFileName);
  if (!existsSync(filePath)) continue;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const delimiterIndex = line.indexOf("=");
    if (delimiterIndex <= 0) continue;
    const key = line.slice(0, delimiterIndex).trim();
    const value = line.slice(delimiterIndex + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (!initialKeys.has(key)) process.env[key] = value;
  }
}

function run(label, args) {
  console.log(`\n[Phase 6] ${label}`);
  const [script, ...scriptArgs] = args;
  const result = spawnSync(process.execPath, [resolve(root, script), ...scriptArgs], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runPrismaDeploy() {
  console.log("\n[Phase 6] Applying additive Prisma migrations");
  const result = spawnSync(process.execPath, [resolve(root, "scripts/prisma-env-runner.mjs"), "migrate", "deploy"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!apply) {
  console.log("Admin Phase 6 migration dry-run. No database or feature flag was changed.");
  console.log("The apply path requires ADMIN_PHASE6_MIGRATION_APPROVED=true and a passing Phase 0 checkpoint.");
  run("Current privacy-minimized inventory", ["scripts/report-admin-phase6.mjs"]);
  process.exit(0);
}

const failures = [];
if (process.env.ADMIN_PHASE6_MIGRATION_APPROVED !== "true") failures.push("ADMIN_PHASE6_MIGRATION_APPROVED must be exactly true");
for (const flag of [
  "ADMIN_GALLERY_PHASE2_ENABLED",
  "ADMIN_CONTENT_PHASE3_ENABLED",
  "ADMIN_CLIENT_DELIVERY_PHASE4_ENABLED",
  "ADMIN_PHASE6_RELEASE_ENABLED",
]) {
  if (process.env[flag] === "true") failures.push(`${flag} must remain false during schema migration`);
}
const directDatabaseUrl = process.env.DIRECT_DATABASE_URL?.trim();
if (!directDatabaseUrl) {
  failures.push("DIRECT_DATABASE_URL is required");
} else {
  try {
    const parsed = new URL(directDatabaseUrl);
    if (!parsed.protocol.startsWith("postgres")) failures.push("DIRECT_DATABASE_URL must use PostgreSQL");
    if (parsed.searchParams.get("sslmode") !== "verify-full") failures.push("DIRECT_DATABASE_URL must use sslmode=verify-full");
    if (parsed.hostname.includes("-pooler.")) failures.push("DIRECT_DATABASE_URL must use a non-pooled provider endpoint");
  } catch {
    failures.push("DIRECT_DATABASE_URL must be a valid URL");
  }
}

if (failures.length > 0) {
  throw new Error(`Admin Phase 6 migration is blocked:\n- ${failures.join("\n- ")}`);
}

run("Re-running the Phase 0 security and infrastructure checkpoint", ["scripts/verify-admin-phase0-checkpoint.mjs"]);
runPrismaDeploy();
run("Verifying lifecycle, asset, content, and delivery backfills", ["scripts/report-admin-phase6.mjs", "--require-schema-ready"]);

console.log("\nAdmin schema migration passed. Feature flags remain unchanged.");
console.log("Next: enable Phases 2-4 in staging, clean legacy archives through the deletion outbox, run delivery/storage/device gates, then enable Phase 6.");
