import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
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

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function listKeys(client, bucket, prefix) {
  const keys = new Set();
  let continuationToken;

  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) keys.add(object.Key);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

const accountId = requireEnv("R2_ACCOUNT_ID");
const publicBucket = process.env.R2_PUBLIC_BUCKET_NAME?.trim() || requireEnv("R2_BUCKET_NAME");
const privateBucket = requireEnv("R2_PRIVATE_BUCKET_NAME");
const client = new S3Client({
  region: process.env.R2_REGION?.trim() || "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(requireEnv("DATABASE_URL")) });

try {
  const [assets, publicKeys, privateSourceKeys, privateDerivativeKeys, pendingDeletions] = await Promise.all([
    prisma.galleryAsset.findMany({
      select: {
        id: true,
        gallery: { select: { visibility: true } },
        storageKey: true,
        sourceStorageArea: true,
        smallStorageKey: true,
        mediumStorageKey: true,
        largeStorageKey: true,
      },
    }),
    listKeys(client, publicBucket, "galleries/public/"),
    listKeys(client, privateBucket, "sources/galleries/"),
    listKeys(client, privateBucket, "galleries/private/"),
    prisma.storageDeletionJob.count({ where: { status: "PENDING" } }),
  ]);

  const expectedPublicKeys = new Set(
    assets
      .filter((asset) => asset.gallery.visibility === "PUBLIC")
      .flatMap((asset) => [asset.smallStorageKey, asset.mediumStorageKey, asset.largeStorageKey])
      .filter(Boolean),
  );
  const expectedPrivateDerivativeKeys = new Set(
    assets
      .filter((asset) => asset.gallery.visibility === "PRIVATE")
      .flatMap((asset) => [asset.smallStorageKey, asset.mediumStorageKey, asset.largeStorageKey])
      .filter(Boolean),
  );
  const expectedPrivateKeys = new Set(assets.map((asset) => asset.storageKey));
  const missingPublicKeys = [...expectedPublicKeys].filter((key) => !publicKeys.has(key));
  const missingPrivateKeys = [...expectedPrivateKeys].filter((key) => !privateSourceKeys.has(key));
  const missingPrivateDerivativeKeys = [...expectedPrivateDerivativeKeys].filter((key) => !privateDerivativeKeys.has(key));
  const legacyDerivativeKeys = [...publicKeys, ...privateDerivativeKeys].filter(
    (key) => /-\d+\.webp$/.test(key) && !key.includes("-v2-"),
  );

  assert.ok(assets.every((asset) => asset.sourceStorageArea === "PRIVATE"), "At least one source original is not private.");
  assert.deepEqual(missingPublicKeys, [], `Missing ${missingPublicKeys.length} public derivative objects.`);
  assert.deepEqual(missingPrivateKeys, [], `Missing ${missingPrivateKeys.length} private source objects.`);
  assert.deepEqual(
    missingPrivateDerivativeKeys,
    [],
    `Missing ${missingPrivateDerivativeKeys.length} private derivative objects.`,
  );
  assert.deepEqual(legacyDerivativeKeys, [], `Found ${legacyDerivativeKeys.length} legacy public derivative objects.`);
  assert.equal(pendingDeletions, 0, "Storage deletion jobs remain active.");

  console.log(
    JSON.stringify(
      {
        assets: assets.length,
        expectedPublicDerivatives: expectedPublicKeys.size,
        publicObjectsUnderGalleryPrefix: publicKeys.size,
        expectedPrivateSources: expectedPrivateKeys.size,
        privateSourceObjects: privateSourceKeys.size,
        expectedPrivateDerivatives: expectedPrivateDerivativeKeys.size,
        privateDerivativeObjects: privateDerivativeKeys.size,
        legacyDerivativeObjects: legacyDerivativeKeys.length,
        pendingDeletions,
      },
      null,
      2,
    ),
  );
  console.log("V2 image storage verification passed.");
} finally {
  await Promise.all([prisma.$disconnect(), client.destroy()]);
}
