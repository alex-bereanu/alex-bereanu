#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

const { Pool } = pg;
const root = process.cwd();
const requireSchemaReady = process.argv.includes("--require-schema-ready");
const requireReleaseReady = process.argv.includes("--require-release-ready");
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

const connectionString = (requireSchemaReady || requireReleaseReady
  ? process.env.DIRECT_DATABASE_URL
  : process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL)?.trim();
if (!connectionString) {
  throw new Error(`${requireSchemaReady || requireReleaseReady ? "DIRECT_DATABASE_URL" : "DATABASE_URL"} is required.`);
}
if (requireSchemaReady || requireReleaseReady) {
  const directUrl = new URL(connectionString);
  if (!directUrl.protocol.startsWith("postgres") || directUrl.searchParams.get("sslmode") !== "verify-full" || directUrl.hostname.includes("-pooler.")) {
    throw new Error("The Phase 6 schema/release gate requires a non-pooled PostgreSQL DIRECT_DATABASE_URL with sslmode=verify-full.");
  }
}

const REQUIRED_MIGRATIONS = [
  "20260804190000_admin_phase2_gallery_workflow",
  "20260804213000_admin_phase3_content_revisions",
  "20260805200000_admin_phase4_client_delivery",
];

function number(value) {
  return Number(value ?? 0);
}

function digest(values) {
  const hash = createHash("sha256");
  for (const value of values) hash.update(String(value)).update("\n");
  return hash.digest("hex");
}

async function identityInventory(client, table, key) {
  const result = await client.query(`SELECT "${key}"::text AS id FROM "${table}" ORDER BY "${key}" ASC`);
  return { count: result.rowCount ?? result.rows.length, identityDigest: digest(result.rows.map((row) => row.id)) };
}

async function tableExists(client, table) {
  const result = await client.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS present`,
    [table],
  );
  return result.rows[0]?.present === true;
}

async function columnExists(client, table, column) {
  const result = await client.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2) AS present`,
    [table, column],
  );
  return result.rows[0]?.present === true;
}

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15_000 });
let client;

try {
  client = await pool.connect();
  const tlsStream = client.connection.stream;
  const tls = {
    encrypted: tlsStream.encrypted === true,
    authorized: tlsStream.authorized === true,
    protocolNegotiated: Boolean(tlsStream.getProtocol?.()),
  };

  const migrationRows = await client.query(`
    SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
    FROM "_prisma_migrations"
    ORDER BY started_at ASC
  `);
  const appliedMigrations = new Set(
    migrationRows.rows
      .filter((row) => row.finished && !row.rolled_back)
      .map((row) => row.migration_name),
  );
  const missingMigrations = REQUIRED_MIGRATIONS.filter((migration) => !appliedMigrations.has(migration));

  const hasPhase2 = await columnExists(client, "Gallery", "status");
  const hasPhase3 = await tableExists(client, "SiteContentRevision");
  const hasPhase4 = await tableExists(client, "GalleryAssetDelivery");

  const baseTables = [
    ["Gallery", "id"],
    ["GalleryAsset", "id"],
    ["GalleryShareLink", "id"],
    ["SiteContent", "key"],
    ["MediaUploadSession", "id"],
    ["MediaProcessingJob", "id"],
    ["StorageDeletionJob", "id"],
  ];
  const entityAccounting = {};
  for (const [table, key] of baseTables) entityAccounting[table] = await identityInventory(client, table, key);
  if (hasPhase3) entityAccounting.SiteContentRevision = await identityInventory(client, "SiteContentRevision", "id");
  if (hasPhase4) entityAccounting.GalleryAssetDelivery = await identityInventory(client, "GalleryAssetDelivery", "id");

  const archiveResult = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE "archiveObjectKey" IS NOT NULL)::int AS objects,
      COUNT(*) FILTER (WHERE "archiveObjectKey" IS NOT NULL AND "archiveStatus" <> 'READY')::int AS invalid_metadata,
      COUNT(*) FILTER (WHERE "archiveObjectKey" IS NULL AND "archiveStatus" <> 'NONE')::int AS status_without_object
    FROM "Gallery"
  `);
  const archiveSessionsResult = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "status" IN ('CREATED', 'UPLOADED', 'PROCESSING'))::int AS active
    FROM "MediaUploadSession" WHERE "kind" = 'GALLERY_ARCHIVE'
  `);
  const archiveJobsResult = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "status" IN ('PENDING', 'PROCESSING', 'RETRY'))::int AS active
    FROM "MediaProcessingJob" WHERE "type" = 'VERIFY_ARCHIVE'
  `);
  const pendingDeletionResult = await client.query(`SELECT COUNT(*)::int AS count FROM "StorageDeletionJob" WHERE "status" = 'PENDING'`);

  let galleries = { schemaAvailable: false };
  let assets = { schemaAvailable: false };
  let content = { schemaAvailable: false };
  let delivery = { schemaAvailable: false, legacyRequestHistoryPolicy: "not-inferred" };
  let activePrivateGalleryDigest = digest([]);
  let activePrivateGalleryCount = 0;

  if (hasPhase2) {
    const galleryResult = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'DRAFT')::int AS draft,
        COUNT(*) FILTER (WHERE "status" = 'PUBLISHED')::int AS published,
        COUNT(*) FILTER (WHERE "status" = 'ARCHIVED')::int AS archived,
        COUNT(*) FILTER (WHERE ("status" = 'PUBLISHED') IS DISTINCT FROM "isActive")::int AS lifecycle_mismatches,
        COUNT(*) FILTER (WHERE "status" = 'PUBLISHED' AND "visibility" = 'PRIVATE' AND "clientDeliveryEnabled")::int AS active_private,
        COUNT(*) FILTER (WHERE "status" = 'PUBLISHED' AND "visibility" = 'PRIVATE' AND NOT "clientDeliveryEnabled")::int AS private_delivery_disabled
      FROM "Gallery"
    `);
    const activePrivateRows = await client.query(`
      SELECT "id"::text AS id FROM "Gallery"
      WHERE "status" = 'PUBLISHED' AND "visibility" = 'PRIVATE' AND "clientDeliveryEnabled"
      ORDER BY "id" ASC
    `);
    activePrivateGalleryDigest = digest(activePrivateRows.rows.map((row) => row.id));
    activePrivateGalleryCount = activePrivateRows.rowCount ?? activePrivateRows.rows.length;
    galleries = {
      schemaAvailable: true,
      lifecycle: {
        draft: number(galleryResult.rows[0].draft),
        published: number(galleryResult.rows[0].published),
        archived: number(galleryResult.rows[0].archived),
        compatibilityMismatches: number(galleryResult.rows[0].lifecycle_mismatches),
      },
      privateDelivery: {
        active: activePrivateGalleryCount,
        publishedButDisabled: number(galleryResult.rows[0].private_delivery_disabled),
        activeIdentityDigest: activePrivateGalleryDigest,
      },
    };

    const assetResult = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "sourceStorageArea" <> 'PRIVATE')::int AS non_private_sources,
        COUNT(*) FILTER (WHERE "storageKey" = '' OR "sizeBytes" <= 0)::int AS invalid_source_metadata,
        COUNT(*) FILTER (WHERE "status" = 'READY' AND (
          "contentHash" IS NULL OR "sourceVerifiedAt" IS NULL OR "width" IS NULL OR "height" IS NULL OR
          "smallStorageKey" IS NULL OR "mediumStorageKey" IS NULL OR "largeStorageKey" IS NULL
        ))::int AS incomplete_ready,
        COUNT(*) FILTER (WHERE ("deletedAt" IS NULL) IS DISTINCT FROM ("purgeAfter" IS NULL))::int AS recycle_date_mismatches,
        COUNT(*) FILTER (WHERE "purgeAfter" < "deletedAt")::int AS invalid_purge_dates,
        COUNT(*) FILTER (WHERE "focalX" IS NOT NULL)::int AS focal_x_set,
        COUNT(*) FILTER (WHERE "focalY" IS NOT NULL)::int AS focal_y_set,
        COUNT(*) FILTER (WHERE NULLIF(BTRIM("altText"), '') IS NOT NULL)::int AS alt_text_set,
        COUNT(*) FILTER (WHERE NULLIF(BTRIM("caption"), '') IS NOT NULL)::int AS caption_set
      FROM "GalleryAsset"
    `);
    const objectCollisionResult = await client.query(`
      WITH refs AS (
        SELECT "storageKey" AS object_key FROM "GalleryAsset"
        UNION ALL SELECT "smallStorageKey" FROM "GalleryAsset" WHERE "smallStorageKey" IS NOT NULL
        UNION ALL SELECT "mediumStorageKey" FROM "GalleryAsset" WHERE "mediumStorageKey" IS NOT NULL
        UNION ALL SELECT "largeStorageKey" FROM "GalleryAsset" WHERE "largeStorageKey" IS NOT NULL
        UNION ALL SELECT "archiveObjectKey" FROM "Gallery" WHERE "archiveObjectKey" IS NOT NULL
      )
      SELECT COUNT(*)::int AS count FROM (SELECT object_key FROM refs GROUP BY object_key HAVING COUNT(*) > 1) collisions
    `);
    assets = {
      schemaAvailable: true,
      total: number(assetResult.rows[0].total),
      nonPrivateSources: number(assetResult.rows[0].non_private_sources),
      invalidSourceMetadata: number(assetResult.rows[0].invalid_source_metadata),
      incompleteReadyRecords: number(assetResult.rows[0].incomplete_ready),
      recycleDateMismatches: number(assetResult.rows[0].recycle_date_mismatches),
      invalidPurgeDates: number(assetResult.rows[0].invalid_purge_dates),
      crossRoleObjectKeyCollisions: number(objectCollisionResult.rows[0].count),
      optionalMetadataCoverage: {
        altText: number(assetResult.rows[0].alt_text_set),
        caption: number(assetResult.rows[0].caption_set),
        focalX: number(assetResult.rows[0].focal_x_set),
        focalY: number(assetResult.rows[0].focal_y_set),
      },
      metadataBackfillPolicy: "nullable-fields-preserved-without-fabricating-captions-or-alt-text",
    };
  }

  if (hasPhase3) {
    const contentResult = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "publishedPayload" IS NULL OR "publishedRevisionId" IS NULL OR "publishedAt" IS NULL)::int AS missing_published_snapshot,
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM "SiteContentRevision" revision
          WHERE revision."id" = "SiteContent"."publishedRevisionId"
            AND revision."contentKey" = "SiteContent"."key"
            AND revision."status" = 'PUBLISHED'
            AND revision."payload" = "SiteContent"."publishedPayload"
        ))::int AS invalid_published_revision
      FROM "SiteContent"
    `);
    const duplicatePublishedResult = await client.query(`
      SELECT COUNT(*)::int AS count FROM (
        SELECT "contentKey" FROM "SiteContentRevision" WHERE "status" = 'PUBLISHED'
        GROUP BY "contentKey" HAVING COUNT(*) <> 1
      ) invalid
    `);
    content = {
      schemaAvailable: true,
      total: number(contentResult.rows[0].total),
      missingPublishedSnapshot: number(contentResult.rows[0].missing_published_snapshot),
      invalidPublishedRevision: number(contentResult.rows[0].invalid_published_revision),
      keysWithInvalidPublishedCount: number(duplicatePublishedResult.rows[0].count),
    };
  }

  const legacyDownloadsResult = await client.query(`SELECT COALESCE(SUM("downloadCount"), 0)::text AS count FROM "GalleryShareLink"`);
  if (hasPhase4) {
    const deliveryResult = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE delivery."galleryId" <> asset."galleryId" OR delivery."galleryId" <> share."galleryId")::int AS gallery_mismatches,
        COUNT(*) FILTER (WHERE delivery."sourceSizeBytes" <= 0)::int AS invalid_size,
        COUNT(*) FILTER (WHERE delivery."sourceContentHash" IS DISTINCT FROM asset."contentHash" OR delivery."sourceSizeBytes" IS DISTINCT FROM asset."sizeBytes")::int AS source_proof_mismatches
      FROM "GalleryAssetDelivery" delivery
      JOIN "GalleryAsset" asset ON asset."id" = delivery."assetId"
      JOIN "GalleryShareLink" share ON share."id" = delivery."shareLinkId"
    `);
    const invalidActiveLinksResult = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM "GalleryShareLink" share
      JOIN "Gallery" gallery ON gallery."id" = share."galleryId"
      WHERE share."isActive" AND share."revokedAt" IS NULL
        AND (share."expiresAt" IS NULL OR share."expiresAt" > CURRENT_TIMESTAMP)
        AND (share."tokenHash" IS NULL OR gallery."status" <> 'PUBLISHED' OR gallery."visibility" <> 'PRIVATE' OR NOT gallery."clientDeliveryEnabled")
    `);
    delivery = {
      schemaAvailable: true,
      total: number(deliveryResult.rows[0].total),
      galleryRelationshipMismatches: number(deliveryResult.rows[0].gallery_mismatches),
      invalidSourceSize: number(deliveryResult.rows[0].invalid_size),
      sourceProofMismatches: number(deliveryResult.rows[0].source_proof_mismatches),
      invalidActiveShareLinks: number(invalidActiveLinksResult.rows[0].count),
      legacyRequestCount: number(legacyDownloadsResult.rows[0].count),
      legacyRequestHistoryPolicy: "not-inferred-into-per-photo-deliveries",
    };
  } else {
    delivery.legacyRequestCount = number(legacyDownloadsResult.rows[0].count);
  }

  const schemaBlockers = [];
  if (!tls.encrypted || !tls.authorized || !tls.protocolNegotiated) schemaBlockers.push("database session is not authorized TLS");
  if (missingMigrations.length > 0) schemaBlockers.push(`${missingMigrations.length} Admin migration(s) are not applied`);
  if (!hasPhase2 || !hasPhase3 || !hasPhase4) schemaBlockers.push("Phase 2, Phase 3, and Phase 4 schema is incomplete");
  if (hasPhase2) {
    if (galleries.lifecycle.compatibilityMismatches > 0) schemaBlockers.push("gallery lifecycle compatibility values disagree");
    if (assets.nonPrivateSources > 0) schemaBlockers.push("one or more source originals are not private");
    if (assets.invalidSourceMetadata > 0 || assets.incompleteReadyRecords > 0) schemaBlockers.push("asset source or READY metadata is incomplete");
    if (assets.recycleDateMismatches > 0 || assets.invalidPurgeDates > 0) schemaBlockers.push("asset recycle metadata is inconsistent");
    if (assets.crossRoleObjectKeyCollisions > 0) schemaBlockers.push("storage keys collide across source, derivative, or archive roles");
  }
  if (hasPhase3 && (content.missingPublishedSnapshot > 0 || content.invalidPublishedRevision > 0 || content.keysWithInvalidPublishedCount > 0)) {
    schemaBlockers.push("content revision backfill is incomplete");
  }
  if (hasPhase4 && (delivery.galleryRelationshipMismatches > 0 || delivery.invalidSourceSize > 0 || delivery.sourceProofMismatches > 0)) {
    schemaBlockers.push("delivery records do not match their source assets");
  }

  const releaseBlockers = [...schemaBlockers];
  const archive = archiveResult.rows[0];
  const archiveSessions = archiveSessionsResult.rows[0];
  const archiveJobs = archiveJobsResult.rows[0];
  if (number(archive.objects) > 0 || number(archive.invalid_metadata) > 0 || number(archive.status_without_object) > 0) releaseBlockers.push("legacy archive metadata remains");
  if (number(archiveSessions.active) > 0 || number(archiveJobs.active) > 0) releaseBlockers.push("legacy archive work remains active");
  if (number(pendingDeletionResult.rows[0].count) > 0) releaseBlockers.push("storage deletion outbox is not empty");
  if (hasPhase4 && delivery.invalidActiveShareLinks > 0) releaseBlockers.push("an active share link violates the private delivery boundary");
  if (process.env.ADMIN_GALLERY_PHASE2_ENABLED !== "true" || process.env.ADMIN_CONTENT_PHASE3_ENABLED !== "true" || process.env.ADMIN_CLIENT_DELIVERY_PHASE4_ENABLED !== "true") {
    releaseBlockers.push("Phase 2, Phase 3, and Phase 4 runtime flags are not all enabled");
  }
  if (!process.env.PHASE6_MIGRATION_REPORT_REFERENCE?.trim()) releaseBlockers.push("PHASE6_MIGRATION_REPORT_REFERENCE is missing");
  if (!process.env.PHASE6_DELIVERY_REPORT_REFERENCE?.trim()) releaseBlockers.push("PHASE6_DELIVERY_REPORT_REFERENCE is missing");
  if (!process.env.PHASE6_STORAGE_REPORT_REFERENCE?.trim()) releaseBlockers.push("PHASE6_STORAGE_REPORT_REFERENCE is missing");
  if (activePrivateGalleryCount > 0 && process.env.PHASE6_VERIFIED_PRIVATE_GALLERY_DIGEST !== activePrivateGalleryDigest) {
    releaseBlockers.push("private gallery delivery evidence does not cover the active gallery inventory");
  }
  if (process.env.PHASE6_IOS_SAVE_VERIFIED !== "true" || process.env.PHASE6_ANDROID_SAVE_VERIFIED !== "true") {
    releaseBlockers.push("iOS and Android save verification is incomplete");
  }
  const observationEndsAt = Date.parse(process.env.PHASE6_OBSERVATION_ENDS_AT ?? "");
  if (!Number.isFinite(observationEndsAt) || observationEndsAt <= Date.now()) releaseBlockers.push("rollback observation window is missing or has elapsed");

  const report = {
    generatedAt: new Date().toISOString(),
    mode: requireReleaseReady ? "release-ready" : requireSchemaReady ? "schema-ready" : "inventory",
    privacy: "counts and non-reversible identity digests only",
    databaseSession: tls,
    migrations: {
      totalApplied: appliedMigrations.size,
      required: REQUIRED_MIGRATIONS.length,
      missing: missingMigrations,
    },
    entityAccounting,
    galleries,
    assets,
    content,
    delivery,
    legacyArchives: {
      galleryObjects: number(archive.objects),
      invalidMetadata: number(archive.invalid_metadata),
      statusWithoutObject: number(archive.status_without_object),
      uploadSessions: number(archiveSessions.total),
      activeUploadSessions: number(archiveSessions.active),
      processingJobs: number(archiveJobs.total),
      activeProcessingJobs: number(archiveJobs.active),
      pendingStorageDeletions: number(pendingDeletionResult.rows[0].count),
    },
    gates: {
      schemaReady: schemaBlockers.length === 0,
      releaseReady: releaseBlockers.length === 0,
      schemaBlockers,
      releaseBlockers,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  const blockers = requireReleaseReady ? releaseBlockers : requireSchemaReady ? schemaBlockers : [];
  if (blockers.length > 0) {
    console.error(`Admin Phase 6 ${requireReleaseReady ? "release" : "schema"} gate is blocked (${blockers.length} condition(s)).`);
    process.exitCode = 1;
  }
} finally {
  client?.release();
  await pool.end();
}
