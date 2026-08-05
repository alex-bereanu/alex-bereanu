#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const initialKeys = new Set(Object.keys(process.env));

for (const envFileName of [".env", ".env.local", ".env.phase0.local"]) {
  const filePath = resolve(process.cwd(), envFileName);
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

const checks = [
  ["Admin mutation and private-media controls", "scripts/verify-admin-phase0.mjs"],
  ["Runtime dependency policy", "scripts/check-dependency-policy.mjs"],
  ["Staging configuration", "scripts/verify-production-config.mjs"],
  ["Backup, restore, TLS, and device evidence", "scripts/verify-admin-phase0-infrastructure.mjs"],
];

for (const [label, script] of checks) {
  console.log(`\n[Phase 0] ${label}`);
  const result = spawnSync(process.execPath, [resolve(process.cwd(), script)], {
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nAdmin Phase 0 security checkpoint passed. The gated Admin Phase 2–4 migrations and Phase 6 staging release work may now begin.");
