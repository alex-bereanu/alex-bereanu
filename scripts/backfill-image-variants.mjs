import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

import generatedPrisma from "../src/generated/prisma/client.ts";

const { PrismaClient } = generatedPrisma;

loadEnvFile(".env");
loadEnvFile(".env.local");

const execute = process.argv.includes("--execute");
const rebuildReady = process.argv.includes("--rebuild-ready");
const limit = parsePositiveIntegerArgument("--limit=");
const targetVariantMarker = "-v2-";
const prisma = new PrismaClient({ adapter: new PrismaPg(requireEnv("DATABASE_URL")) });

function loadEnvFile(filename) {
  const envPath = path.join(process.cwd(), filename);

  if (!fs.existsSync(envPath)) return;

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

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parsePositiveIntegerArgument(prefix) {
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return 500;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw new Error(`${prefix}<number> must be between 1 and 10000.`);
  }
  return parsed;
}

try {
  const eligibilityFilter = rebuildReady
    ? {
        status: "READY",
        NOT: { smallStorageKey: { contains: targetVariantMarker } },
      }
    : {
        OR: [
          { status: { not: "READY" } },
          { smallStorageKey: null },
          { mediumStorageKey: null },
          { largeStorageKey: null },
          { placeholderDataUrl: null },
          { sourceVerifiedAt: null },
        ],
      };
  const assets = await prisma.galleryAsset.findMany({
    where: {
      ...eligibilityFilter,
      processingJobs: {
        none: { status: { in: ["PENDING", "PROCESSING", "RETRY"] } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, originalFilename: true, status: true },
  });

  console.log(
    `Eligible gallery assets: ${assets.length}. Scope: ${rebuildReady ? "READY V1 REBUILD" : "INCOMPLETE"}. Mode: ${execute ? "EXECUTE" : "DRY RUN"}.`,
  );
  for (const asset of assets.slice(0, 20)) {
    console.log(`- ${asset.id} [${asset.status}] ${asset.originalFilename}`);
  }
  if (assets.length > 20) console.log(`- ...and ${assets.length - 20} more`);

  if (!execute) {
    console.log("No records changed. Re-run with --execute after reviewing the dry-run output.");
  } else if (assets.length > 0) {
    const result = await prisma.mediaProcessingJob.createMany({
      data: assets.map((asset) => ({ type: "REBUILD_IMAGE", assetId: asset.id })),
    });
    console.log(`Queued ${result.count} durable rebuild jobs. Run the authenticated media worker to process them.`);
  }
} finally {
  await prisma.$disconnect();
}
