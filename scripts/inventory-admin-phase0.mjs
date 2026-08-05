import fs from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import generatedPrisma from "../src/generated/prisma/client.ts";

const { PrismaClient } = generatedPrisma;

for (const filename of [".env", ".env.local"]) {
  const envPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(envPath)) continue;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    process.env[key] ??= value;
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

function countsBy(rows, key) {
  return Object.fromEntries(rows.map((row) => [row[key], row._count._all]));
}

const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

try {
  const now = new Date();
  let migrationHistory;

  try {
    const migrationRows = await prisma.$queryRaw`
      SELECT "migration_name", "finished_at", "rolled_back_at"
      FROM "_prisma_migrations"
      ORDER BY "started_at" ASC
    `;
    migrationHistory = {
      available: true,
      migrations: migrationRows.map((row) => ({
        name: row.migration_name,
        finished: Boolean(row.finished_at),
        rolledBack: Boolean(row.rolled_back_at),
      })),
    };
  } catch (error) {
    migrationHistory = {
      available: false,
      reason: error instanceof Error ? error.constructor.name : "UnknownError",
    };
  }

  const [
    galleryTotal,
    galleriesByCategory,
    galleriesByVisibility,
    galleriesByActiveState,
    galleriesWithoutAssets,
    galleriesWithArchives,
    archivesByStatus,
    assetsByStatus,
    assetsBySourceArea,
    privateGalleryAssets,
    shareLinkTotal,
    activeShareLinks,
    expiredShareLinks,
    legacyShareLinks,
    passwordProtectedLinks,
    limitedShareLinks,
    mediaJobsByStatus,
    uploadSessionsByStatus,
    deletionJobsByStatus,
    siteContentRows,
  ] = await Promise.all([
    prisma.gallery.count(),
    prisma.gallery.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.gallery.groupBy({ by: ["visibility"], _count: { _all: true } }),
    prisma.gallery.groupBy({ by: ["isActive"], _count: { _all: true } }),
    prisma.gallery.count({ where: { assets: { none: {} } } }),
    prisma.gallery.count({ where: { archiveObjectKey: { not: null } } }),
    prisma.gallery.groupBy({ by: ["archiveStatus"], _count: { _all: true } }),
    prisma.galleryAsset.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.galleryAsset.groupBy({ by: ["sourceStorageArea"], _count: { _all: true } }),
    prisma.galleryAsset.count({ where: { gallery: { visibility: "PRIVATE" } } }),
    prisma.galleryShareLink.count(),
    prisma.galleryShareLink.count({ where: { isActive: true, revokedAt: null } }),
    prisma.galleryShareLink.count({ where: { expiresAt: { lte: now } } }),
    prisma.galleryShareLink.count({ where: { tokenHash: null } }),
    prisma.galleryShareLink.count({ where: { passwordHash: { not: null } } }),
    prisma.galleryShareLink.count({ where: { maxDownloads: { not: null } } }),
    prisma.mediaProcessingJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.mediaUploadSession.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.storageDeletionJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.siteContent.findMany({ select: { key: true }, orderBy: { key: "asc" } }),
  ]);

  const report = {
    generatedAt: now.toISOString(),
    migrationHistory,
    galleries: {
      total: galleryTotal,
      byCategory: countsBy(galleriesByCategory, "category"),
      byVisibility: countsBy(galleriesByVisibility, "visibility"),
      byActiveState: Object.fromEntries(
        galleriesByActiveState.map((row) => [row.isActive ? "ACTIVE" : "INACTIVE", row._count._all]),
      ),
      withoutAssets: galleriesWithoutAssets,
      withLegacyArchive: galleriesWithArchives,
      archiveStatus: countsBy(archivesByStatus, "archiveStatus"),
    },
    assets: {
      byStatus: countsBy(assetsByStatus, "status"),
      bySourceStorageArea: countsBy(assetsBySourceArea, "sourceStorageArea"),
      belongingToPrivateGalleries: privateGalleryAssets,
    },
    shareLinks: {
      total: shareLinkTotal,
      active: activeShareLinks,
      expired: expiredShareLinks,
      legacyWithoutTokenHash: legacyShareLinks,
      passwordProtected: passwordProtectedLinks,
      withRequestLimit: limitedShareLinks,
    },
    operations: {
      mediaJobs: countsBy(mediaJobsByStatus, "status"),
      uploadSessions: countsBy(uploadSessionsByStatus, "status"),
      storageDeletionJobs: countsBy(deletionJobsByStatus, "status"),
    },
    siteContent: {
      rows: siteContentRows.length,
      keys: siteContentRows.map((row) => row.key),
    },
  };

  console.log(JSON.stringify(report, null, 2));
} finally {
  await prisma.$disconnect();
}
