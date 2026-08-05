#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

const { Pool } = pg;

for (const envFileName of [".env", ".env.local"]) {
  const filePath = resolve(process.cwd(), envFileName);
  if (!existsSync(filePath)) continue;

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const delimiterIndex = line.indexOf("=");
    if (delimiterIndex <= 0) continue;
    const key = line.slice(0, delimiterIndex).trim();
    const value = line.slice(delimiterIndex + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    process.env[key] ??= value;
  }
}

const failures = [];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) failures.push(`${name} is required`);
  return value ?? "";
}

function requireTrue(name) {
  if (process.env[name] !== "true") failures.push(`${name} must be exactly true`);
}

function parseVerifiedDatabaseUrl(name, value, { direct = false } = {}) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    failures.push(`${name} must be a valid PostgreSQL URL`);
    return null;
  }

  if (!url.protocol.startsWith("postgres")) failures.push(`${name} must use PostgreSQL`);
  if (url.searchParams.get("sslmode") !== "verify-full") failures.push(`${name} must use sslmode=verify-full`);
  if (direct && url.hostname.includes("-pooler.")) failures.push(`${name} must use a non-pooled provider endpoint`);
  return url;
}

const directDatabaseUrlValue = required("DIRECT_DATABASE_URL");
const restoreDatabaseUrlValue = required("PHASE0_RESTORE_DATABASE_URL");
const directDatabaseUrl = parseVerifiedDatabaseUrl("DIRECT_DATABASE_URL", directDatabaseUrlValue, { direct: true });
const restoreDatabaseUrl = parseVerifiedDatabaseUrl("PHASE0_RESTORE_DATABASE_URL", restoreDatabaseUrlValue, { direct: true });

required("PHASE0_BACKUP_PROVIDER");
required("PHASE0_BACKUP_REFERENCE");
required("PHASE0_BACKUP_CREATED_AT");
required("PHASE0_RESTORE_REFERENCE");
required("PHASE0_STORAGE_RESTORE_REFERENCE");
required("PHASE0_SYNTHETIC_REPORT_REFERENCE");
requireTrue("PHASE0_BACKUP_ENCRYPTED");
requireTrue("PHASE0_RESTORE_ISOLATED");
requireTrue("PHASE0_STORAGE_RESTORE_VERIFIED");
requireTrue("PHASE0_SYNTHETIC_AUTHORIZATION_VERIFIED");
requireTrue("PHASE0_IOS_SAVE_VERIFIED");
requireTrue("PHASE0_ANDROID_SAVE_VERIFIED");

const backupCreatedAt = Date.parse(process.env.PHASE0_BACKUP_CREATED_AT ?? "");
if (!Number.isFinite(backupCreatedAt)) failures.push("PHASE0_BACKUP_CREATED_AT must be an ISO-8601 timestamp");
if (process.env.ADMIN_GALLERY_PHASE2_ENABLED === "true" || process.env.ADMIN_CONTENT_PHASE3_ENABLED === "true" || process.env.ADMIN_CLIENT_DELIVERY_PHASE4_ENABLED === "true" || process.env.ADMIN_PHASE6_RELEASE_ENABLED === "true") {
  failures.push("Admin Phase 2, Phase 3, Phase 4, and Phase 6 flags must remain disabled while the pre-migration checkpoint runs");
}

if (directDatabaseUrl && restoreDatabaseUrl) {
  const sourceIdentity = `${directDatabaseUrl.hostname}:${directDatabaseUrl.port}/${directDatabaseUrl.pathname}`;
  const restoreIdentity = `${restoreDatabaseUrl.hostname}:${restoreDatabaseUrl.port}/${restoreDatabaseUrl.pathname}`;
  if (sourceIdentity === restoreIdentity) failures.push("PHASE0_RESTORE_DATABASE_URL must target an isolated database endpoint");
}

if (failures.length > 0) {
  throw new Error(`Phase 0 infrastructure checkpoint is blocked:\n- ${failures.join("\n- ")}`);
}

const inventoryTables = [
  ["Gallery", "id"],
  ["GalleryAsset", "id"],
  ["GalleryShareLink", "id"],
  ["SiteContent", "key"],
  ["MediaProcessingJob", "id"],
  ["MediaUploadSession", "id"],
  ["StorageDeletionJob", "id"],
];

async function captureInventory(label, connectionString) {
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15_000 });
  let client;
  try {
    client = await pool.connect();
    const tlsStream = client.connection.stream;
    if (tlsStream.encrypted !== true || tlsStream.authorized !== true || !tlsStream.getProtocol?.()) {
      throw new Error(`${label} did not establish an authorized TLS client session`);
    }

    const tables = {};
    for (const [table, key] of inventoryTables) {
      const result = await client.query(`SELECT "${key}"::text AS id FROM "${table}" ORDER BY "${key}" ASC`);
      const digest = createHash("sha256");
      for (const row of result.rows) digest.update(row.id).update("\n");
      tables[table] = { count: result.rowCount, idDigest: digest.digest("hex") };
    }

    const migrations = await client.query(`
      SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
      FROM "_prisma_migrations"
      ORDER BY started_at ASC
    `);
    const migrationDigest = createHash("sha256")
      .update(JSON.stringify(migrations.rows))
      .digest("hex");

    return { tables, migrations: { count: migrations.rowCount, digest: migrationDigest } };
  } finally {
    client?.release();
    await pool.end();
  }
}

const [source, restore] = await Promise.all([
  captureInventory("source database", directDatabaseUrlValue),
  captureInventory("isolated restored database", restoreDatabaseUrlValue),
]);

const mismatches = [];
for (const [table] of inventoryTables) {
  if (source.tables[table].count !== restore.tables[table].count) {
    mismatches.push(`${table} count differs`);
  }
  if (source.tables[table].idDigest !== restore.tables[table].idDigest) {
    mismatches.push(`${table} identity digest differs`);
  }
}
if (source.migrations.count !== restore.migrations.count || source.migrations.digest !== restore.migrations.digest) {
  mismatches.push("migration history differs");
}
if (mismatches.length > 0) {
  throw new Error(`Phase 0 restored-database comparison failed:\n- ${mismatches.join("\n- ")}`);
}

console.log(
  `Admin Phase 0 infrastructure checkpoint passed (${inventoryTables.length} table inventories match, both database sessions use TLS, and backup/storage/mobile evidence is recorded).`,
);
