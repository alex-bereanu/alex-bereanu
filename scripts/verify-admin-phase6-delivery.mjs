#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";

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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function identityDigest(values) {
  const hash = createHash("sha256");
  for (const value of [...values].sort()) hash.update(value).update("\n");
  return hash.digest("hex");
}

function expect(condition, label) {
  if (!condition) throw new Error(label);
}

function ignoredEvidencePath(value, label) {
  const filePath = resolve(root, value);
  const relativePath = relative(root, filePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath) || !/^\.phase6-.+\.json$/.test(basename(filePath))) {
    throw new Error(`${label} must be an ignored .phase6-*.json file inside the workspace.`);
  }
  return filePath;
}

async function hashResponseBody(response) {
  expect(response.body, "full response has no body");
  const hash = createHash("sha256");
  let bytes = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
    bytes += value.byteLength;
  }
  return { bytes, hash: hash.digest("hex") };
}

async function waitForDeliveryRecord(client, shareLinkId, assetId) {
  const deadline = Date.now() + 5_000;
  do {
    const result = await client.query(
      `SELECT "sourceContentHash", "sourceSizeBytes"::text AS size FROM "GalleryAssetDelivery" WHERE "shareLinkId" = $1 AND "assetId" = $2`,
      [shareLinkId, assetId],
    );
    if (result.rowCount === 1) return result.rows[0];
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  } while (Date.now() < deadline);
  return null;
}

const baseUrl = new URL(required("PHASE6_STAGING_BASE_URL"));
if (process.env.PHASE6_DELIVERY_VERIFICATION_APPROVED !== "true") {
  throw new Error("PHASE6_DELIVERY_VERIFICATION_APPROVED must be exactly true because this check records staging access and delivery evidence.");
}
if (baseUrl.protocol !== "https:") throw new Error("PHASE6_STAGING_BASE_URL must use HTTPS.");
if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
  throw new Error("PHASE6_STAGING_BASE_URL must not contain credentials, query parameters, or a fragment.");
}
const manifestPath = ignoredEvidencePath(required("PHASE6_DELIVERY_MANIFEST_PATH"), "PHASE6_DELIVERY_MANIFEST_PATH");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest) || manifest.length === 0) throw new Error("The Phase 6 delivery manifest must contain at least one staging gallery.");
for (const item of manifest) {
  if (!item || typeof item !== "object" || !/^[A-Za-z0-9_-]{43}$/.test(item.capabilityToken) || typeof item.assetId !== "string" || item.assetId.length < 1) {
    throw new Error("The Phase 6 delivery manifest contains an invalid entry.");
  }
}

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
  expect(tlsStream.encrypted === true && tlsStream.authorized === true && Boolean(tlsStream.getProtocol?.()), "database TLS is not authorized");

  const activeGalleryRows = await client.query(`
    SELECT "id"::text AS id FROM "Gallery"
    WHERE "status" = 'PUBLISHED' AND "visibility" = 'PRIVATE' AND "clientDeliveryEnabled"
    ORDER BY "id" ASC
  `);
  expect(activeGalleryRows.rowCount > 0, "staging has no active private gallery to verify");
  const activeIds = activeGalleryRows.rows.map((row) => row.id);
  const coveredGalleryIds = new Set();
  const checked = [];

  for (let index = 0; index < manifest.length; index += 1) {
    const item = manifest[index];
    try {
      const linkResult = await client.query(`
        SELECT share."id"::text AS share_id, share."galleryId"::text AS gallery_id
        FROM "GalleryShareLink" share
        JOIN "Gallery" gallery ON gallery."id" = share."galleryId"
        WHERE share."tokenHash" = $1 AND share."isActive" AND share."revokedAt" IS NULL
          AND (share."expiresAt" IS NULL OR share."expiresAt" > CURRENT_TIMESTAMP)
          AND share."passwordHash" IS NULL
          AND gallery."status" = 'PUBLISHED' AND gallery."visibility" = 'PRIVATE' AND gallery."clientDeliveryEnabled"
      `, [sha256(item.capabilityToken)]);
      expect(linkResult.rowCount === 1, "capability is not a unique active passwordless staging link");
      const link = linkResult.rows[0];
      expect(!coveredGalleryIds.has(link.gallery_id), "manifest contains more than one entry for a gallery");

      const assetResult = await client.query(`
        SELECT "contentHash", "sizeBytes"::text AS size
        FROM "GalleryAsset"
        WHERE "id" = $1 AND "galleryId" = $2 AND "status" = 'READY' AND "deletedAt" IS NULL
          AND "sourceStorageArea" = 'PRIVATE' AND "sourceVerifiedAt" IS NOT NULL AND "contentHash" IS NOT NULL
      `, [item.assetId, link.gallery_id]);
      expect(assetResult.rowCount === 1, "approved asset is not a verified active original in that gallery");
      const asset = assetResult.rows[0];
      const downloadPath = `/api/galleries/${encodeURIComponent(item.capabilityToken)}/assets/${encodeURIComponent(item.assetId)}/download`;
      const downloadUrl = new URL(downloadPath, baseUrl);

      const unauthenticated = await fetch(downloadUrl, { redirect: "manual" });
      expect(unauthenticated.status === 404, "original is reachable without its grant cookie");

      const authorizeUrl = new URL(`/api/gallery-access/authorize/${encodeURIComponent(item.capabilityToken)}`, baseUrl);
      const authorization = await fetch(authorizeUrl, { redirect: "manual" });
      expect(authorization.status === 303, "passwordless authorization did not return the expected redirect");
      const location = authorization.headers.get("location") ?? "";
      expect(new URL(location, baseUrl).pathname === `/g/${item.capabilityToken}`, "authorization redirect crossed the expected gallery boundary");
      const cookie = (authorization.headers.get("set-cookie") ?? "").split(";", 1)[0];
      expect(cookie.includes("="), "authorization did not issue a grant cookie");

      const head = await fetch(downloadUrl, { method: "HEAD", headers: { Cookie: cookie }, redirect: "manual" });
      expect(head.status === 200, "authorized original HEAD failed");
      expect(head.headers.get("accept-ranges") === "bytes", "original does not advertise byte ranges");
      expect(head.headers.get("cache-control")?.includes("no-store"), "original response is cacheable");
      expect(Number(head.headers.get("content-length")) === Number(asset.size), "HEAD size differs from database source size");

      const rangeEnd = Math.min(1023, Number(asset.size) - 1);
      const range = await fetch(downloadUrl, {
        headers: { Cookie: cookie, Range: `bytes=0-${rangeEnd}` },
        redirect: "manual",
      });
      expect(range.status === 206, "authorized range request failed");
      expect((await range.arrayBuffer()).byteLength === rangeEnd + 1, "range response length is incorrect");

      const full = await fetch(new URL(`${downloadPath}?intent=download`, baseUrl), { headers: { Cookie: cookie }, redirect: "manual" });
      expect(full.status === 200, "authorized full original request failed");
      const transferred = await hashResponseBody(full);
      expect(transferred.bytes === Number(asset.size), "full transfer size differs from the approved source");
      expect(transferred.hash === asset.contentHash, "full transfer checksum differs from the approved source");

      const delivery = await waitForDeliveryRecord(client, link.share_id, item.assetId);
      expect(delivery && delivery.sourceContentHash === asset.contentHash && Number(delivery.size) === Number(asset.size), "completed transfer did not create matching delivery proof");

      coveredGalleryIds.add(link.gallery_id);
      checked.push({ cookie, capabilityToken: item.capabilityToken, assetId: item.assetId });
    } catch {
      throw new Error(`delivery manifest entry ${index + 1} failed; no private request details were logged`);
    }
  }

  expect(coveredGalleryIds.size === activeIds.length && activeIds.every((id) => coveredGalleryIds.has(id)), "manifest does not cover every active private gallery exactly once");

  const first = checked[0];
  const otherAssetId = checked[1]?.assetId ?? "phase6-cross-gallery-negative-control";
  const crossGallery = await fetch(
    new URL(`/api/galleries/${encodeURIComponent(first.capabilityToken)}/assets/${encodeURIComponent(otherAssetId)}/download`, baseUrl),
    { method: "HEAD", headers: { Cookie: first.cookie }, redirect: "manual" },
  );
  expect(crossGallery.status === 404, "a gallery grant crossed the asset ownership boundary");

  const report = {
    generatedAt: new Date().toISOString(),
    targetOrigin: baseUrl.origin,
    privacy: "no capabilities, cookies, identifiers, filenames, or object keys retained",
    activePrivateGalleries: activeIds.length,
    verifiedPrivateGalleryDigest: identityDigest(activeIds),
    checks: {
      unauthenticatedOriginalDenied: checked.length,
      passwordlessAuthorization: checked.length,
      originalHeadIntegrity: checked.length,
      originalByteRange: checked.length,
      completeOriginalChecksum: checked.length,
      deliveryRecordProof: checked.length,
      crossGalleryDenied: 1,
    },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  console.log(serialized.trimEnd());

  const reportPathValue = process.env.PHASE6_DELIVERY_REPORT_PATH?.trim();
  if (reportPathValue) {
    const reportPath = ignoredEvidencePath(reportPathValue, "PHASE6_DELIVERY_REPORT_PATH");
    writeFileSync(reportPath, serialized, { encoding: "utf8", flag: "wx" });
    console.log("Phase 6 delivery evidence was written to the configured ignored workspace path.");
  }
} finally {
  client?.release();
  await pool.end();
}
