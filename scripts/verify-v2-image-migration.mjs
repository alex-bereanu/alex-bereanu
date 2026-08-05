import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import generatedPrisma from "../src/generated/prisma/client.ts";

const { PrismaClient } = generatedPrisma;
const requireComplete = process.argv.includes("--require-complete");
const activeJobStatuses = new Set(["PENDING", "PROCESSING", "RETRY"]);

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

const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

try {
  const [assets, groupedJobs] = await Promise.all([
    prisma.galleryAsset.findMany({
      select: {
        id: true,
        gallery: { select: { slug: true } },
        status: true,
        sourceStorageArea: true,
        smallStorageKey: true,
        smallWidth: true,
        smallHeight: true,
        smallSizeBytes: true,
        mediumStorageKey: true,
        mediumWidth: true,
        mediumHeight: true,
        mediumSizeBytes: true,
        largeStorageKey: true,
        largeWidth: true,
        largeHeight: true,
        largeSizeBytes: true,
      },
    }),
    prisma.mediaProcessingJob.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const v2Assets = assets.filter((asset) => asset.smallStorageKey?.includes("-v2-800-q82.webp"));
  const activeJobs = groupedJobs
    .filter((row) => activeJobStatuses.has(row.status))
    .reduce((total, row) => total + row._count._all, 0);

  for (const asset of v2Assets) {
    assert.equal(asset.status, "READY", `${asset.id} has v2 derivatives but is not READY.`);
    assert.equal(asset.sourceStorageArea, "PRIVATE", `${asset.id} source original is not private.`);
    assert.ok(asset.mediumStorageKey?.includes("-v2-1440-q84.webp"), `${asset.id} has the wrong medium key.`);
    assert.ok(asset.largeStorageKey?.includes("-v2-2560-q86.webp"), `${asset.id} has the wrong large key.`);

    for (const [name, width, height, size, maximum] of [
      ["small", asset.smallWidth, asset.smallHeight, asset.smallSizeBytes, 800],
      ["medium", asset.mediumWidth, asset.mediumHeight, asset.mediumSizeBytes, 1440],
      ["large", asset.largeWidth, asset.largeHeight, asset.largeSizeBytes, 2560],
    ]) {
      assert.ok(width && height && width > 0 && height > 0, `${asset.id} ${name} dimensions are invalid.`);
      assert.ok(Math.max(width, height) <= maximum, `${asset.id} ${name} exceeds ${maximum}px.`);
      assert.ok(size && size > 0n, `${asset.id} ${name} has an invalid byte size.`);
    }
  }

  const report = {
    totalAssets: assets.length,
    readyAssets: assets.filter((asset) => asset.status === "READY").length,
    v2Assets: v2Assets.length,
    activeJobs,
    v2GalleryCounts: Object.fromEntries(
      [...new Set(v2Assets.map((asset) => asset.gallery.slug))]
        .sort()
        .map((slug) => [slug, v2Assets.filter((asset) => asset.gallery.slug === slug).length]),
    ),
    jobStatusCounts: Object.fromEntries(groupedJobs.map((row) => [row.status, row._count._all])),
  };

  if (requireComplete) {
    assert.equal(report.v2Assets, report.totalAssets, "Not every gallery asset uses v2 derivatives.");
    assert.equal(report.readyAssets, report.totalAssets, "Not every gallery asset is READY.");
    assert.equal(report.activeJobs, 0, "Active media jobs remain.");
  }

  console.log(JSON.stringify(report, null, 2));
  console.log(`V2 image migration verification passed${requireComplete ? " in complete mode" : ""}.`);
} finally {
  await prisma.$disconnect();
}
