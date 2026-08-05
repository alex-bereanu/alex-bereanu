#!/usr/bin/env node

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

const { Pool } = pg;
const root = process.cwd();
const initialKeys = new Set(Object.keys(process.env));

for (const envFileName of [".env", ".env.local", ".env.phase6.local"]) {
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

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function listKeys(s3, bucket, prefix) {
  const keys = new Set();
  let continuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }));
    for (const object of page.Contents ?? []) if (object.Key) keys.add(object.Key);
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

const accountId = required("R2_ACCOUNT_ID");
const publicBucket = process.env.R2_PUBLIC_BUCKET_NAME?.trim() || required("R2_BUCKET_NAME");
const privateBucket = required("R2_PRIVATE_BUCKET_NAME");
if (publicBucket === privateBucket) throw new Error("Public and private R2 buckets must be distinct.");

const s3 = new S3Client({
  region: process.env.R2_REGION?.trim() || "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  },
});
const directDatabaseUrl = required("DIRECT_DATABASE_URL");
const parsedDirectDatabaseUrl = new URL(directDatabaseUrl);
if (!parsedDirectDatabaseUrl.protocol.startsWith("postgres") || parsedDirectDatabaseUrl.searchParams.get("sslmode") !== "verify-full" || parsedDirectDatabaseUrl.hostname.includes("-pooler.")) {
  throw new Error("DIRECT_DATABASE_URL must be a non-pooled PostgreSQL endpoint with sslmode=verify-full.");
}
const pool = new Pool({ connectionString: directDatabaseUrl, max: 1, connectionTimeoutMillis: 15_000 });
let client;

try {
  client = await pool.connect();
  const tlsStream = client.connection.stream;
  if (tlsStream.encrypted !== true || tlsStream.authorized !== true || !tlsStream.getProtocol?.()) {
    throw new Error("The storage inventory database session is not authorized TLS.");
  }

  const [assetRows, archiveRows, deletionRows, privateSources, publicSources, privateGalleryObjects, publicGalleryObjects] = await Promise.all([
    client.query(`SELECT "storageKey", "sourceStorageArea"::text AS area FROM "GalleryAsset"`),
    client.query(`SELECT "archiveObjectKey", "archiveStorageArea"::text AS area FROM "Gallery" WHERE "archiveObjectKey" IS NOT NULL`),
    client.query(`SELECT "objectKey", "storageArea"::text AS area FROM "StorageDeletionJob" WHERE "status" = 'PENDING'`),
    listKeys(s3, privateBucket, "sources/galleries/"),
    listKeys(s3, publicBucket, "sources/galleries/"),
    listKeys(s3, privateBucket, "galleries/private/"),
    listKeys(s3, publicBucket, "galleries/public/"),
  ]);

  const expectedPrivateSources = new Set(assetRows.rows.filter((row) => row.area === "PRIVATE").map((row) => row.storageKey));
  const pendingPrivate = new Set(deletionRows.rows.filter((row) => row.area === "PRIVATE").map((row) => row.objectKey));
  const pendingPublic = new Set(deletionRows.rows.filter((row) => row.area === "PUBLIC").map((row) => row.objectKey));
  const privateArchives = new Set([...privateGalleryObjects].filter((key) => key.includes("/archives/")));
  const publicArchives = new Set([...publicGalleryObjects].filter((key) => key.includes("/archives/")));
  const expectedPrivateArchives = new Set(archiveRows.rows.filter((row) => row.area === "PRIVATE").map((row) => row.archiveObjectKey));
  const expectedPublicArchives = new Set(archiveRows.rows.filter((row) => row.area === "PUBLIC").map((row) => row.archiveObjectKey));

  const missingSources = [...expectedPrivateSources].filter((key) => !privateSources.has(key));
  const orphanedSources = [...privateSources].filter((key) => !expectedPrivateSources.has(key) && !pendingPrivate.has(key));
  const orphanedPrivateArchives = [...privateArchives].filter((key) => !expectedPrivateArchives.has(key) && !pendingPrivate.has(key));
  const orphanedPublicArchives = [...publicArchives].filter((key) => !expectedPublicArchives.has(key) && !pendingPublic.has(key));
  const missingArchives = [
    ...[...expectedPrivateArchives].filter((key) => !privateArchives.has(key)),
    ...[...expectedPublicArchives].filter((key) => !publicArchives.has(key)),
  ];
  const invalidSourcePrefix = [...expectedPrivateSources].filter((key) => !key.startsWith("sources/galleries/"));
  const nonPrivateDatabaseSources = assetRows.rows.filter((row) => row.area !== "PRIVATE");

  const report = {
    generatedAt: new Date().toISOString(),
    privacy: "aggregate object counts only; no bucket names or object keys retained",
    databaseOriginals: assetRows.rowCount,
    expectedPrivateOriginals: expectedPrivateSources.size,
    privateSourceObjects: privateSources.size,
    publicSourceObjects: publicSources.size,
    missingPrivateOriginals: missingSources.length,
    orphanedPrivateOriginals: orphanedSources.length,
    originalsWithInvalidPrefix: invalidSourcePrefix.length,
    originalsMarkedNonPrivate: nonPrivateDatabaseSources.length,
    legacyArchives: {
      databaseReferences: archiveRows.rowCount,
      privateObjects: privateArchives.size,
      publicObjects: publicArchives.size,
      missingObjects: missingArchives.length,
      orphanedPrivateObjects: orphanedPrivateArchives.length,
      orphanedPublicObjects: orphanedPublicArchives.length,
    },
    pendingStorageDeletions: deletionRows.rowCount,
  };
  console.log(JSON.stringify(report, null, 2));

  const failures = [];
  if (publicSources.size > 0 || nonPrivateDatabaseSources.length > 0) failures.push("a source original is exposed through the public storage boundary");
  if (missingSources.length > 0 || orphanedSources.length > 0 || invalidSourcePrefix.length > 0) failures.push("source original inventory is incomplete or orphaned");
  if (archiveRows.rowCount > 0 || privateArchives.size > 0 || publicArchives.size > 0 || missingArchives.length > 0 || orphanedPrivateArchives.length > 0 || orphanedPublicArchives.length > 0) failures.push("legacy archive storage has not been fully retired");
  if (deletionRows.rowCount > 0) failures.push("storage deletion outbox is not empty");
  if (failures.length > 0) throw new Error(`Admin Phase 6 storage gate failed:\n- ${failures.join("\n- ")}`);

  console.log("Admin Phase 6 storage verification passed: every original is private and accounted for, with no legacy archive object remaining.");
} finally {
  client?.release();
  await pool.end();
  s3.destroy();
}
