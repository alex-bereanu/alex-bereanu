import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SMALL_IMAGE_MAX_SIZE = 480;
const MEDIUM_IMAGE_MAX_SIZE = 1600;
const SMALL_IMAGE_QUALITY = 72;
const MEDIUM_IMAGE_QUALITY = 80;
const VARIANT_CONTENT_TYPE = "image/webp";
const PROCESSING_CONCURRENCY = 2;

loadEnvFile(".env");
loadEnvFile(".env.local");

const prisma = new PrismaClient();
const client = new S3Client({
  region: normalizeR2Region(process.env.R2_REGION),
  endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  },
});

function loadEnvFile(filename) {
  const envPath = path.join(process.cwd(), filename);

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

    process.env[key] ??= value;
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function normalizeR2Region(regionValue) {
  const trimmed = regionValue?.trim();

  if (!trimmed) {
    return "auto";
  }

  if (/^[a-z0-9-]+$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const regionCodeMatch = /\(([a-z0-9-]+)\)\s*$/i.exec(trimmed);
  return regionCodeMatch?.[1]?.toLowerCase() ?? "auto";
}

function parseLimit() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.slice("--limit=".length), 10) : undefined;

  return Number.isInteger(limit) && limit > 0 ? limit : undefined;
}

async function streamToBuffer(body) {
  if (body?.transformToByteArray) {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks = [];

  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function getObjectBuffer(objectKey) {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: requireEnv("R2_BUCKET_NAME"),
      Key: objectKey,
    }),
  );

  return streamToBuffer(response.Body);
}

async function uploadObject(objectKey, body) {
  await client.send(
    new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET_NAME"),
      Key: objectKey,
      ContentType: VARIANT_CONTENT_TYPE,
      Body: body,
    }),
  );
}

function getObjectKeyParts(objectKey) {
  const slashIndex = objectKey.lastIndexOf("/");
  const directory = slashIndex >= 0 ? objectKey.slice(0, slashIndex) : "";
  const filename = slashIndex >= 0 ? objectKey.slice(slashIndex + 1) : objectKey;
  const extensionIndex = filename.lastIndexOf(".");
  const basename = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;

  return { directory, basename: basename || "image" };
}

function buildVariantObjectKey(originalObjectKey, variant) {
  const { directory, basename } = getObjectKeyParts(originalObjectKey);
  const prefix = directory ? `${directory}/variants` : "variants";

  return `${prefix}/${basename}-${variant}.webp`;
}

async function generateVariant(originalBuffer, originalObjectKey, variant, maxSize, quality) {
  const { data, info } = await sharp(originalBuffer, { animated: false })
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 5 })
    .toBuffer({ resolveWithObject: true });

  return {
    objectKey: buildVariantObjectKey(originalObjectKey, variant),
    buffer: data,
    width: info.width,
    height: info.height,
    sizeBytes: BigInt(info.size),
  };
}

async function generateImageVariants(originalObjectKey) {
  const originalBuffer = await getObjectBuffer(originalObjectKey);
  const [small, medium] = await Promise.all([
    generateVariant(originalBuffer, originalObjectKey, "small", SMALL_IMAGE_MAX_SIZE, SMALL_IMAGE_QUALITY),
    generateVariant(originalBuffer, originalObjectKey, "medium", MEDIUM_IMAGE_MAX_SIZE, MEDIUM_IMAGE_QUALITY),
  ]);

  await Promise.all([uploadObject(small.objectKey, small.buffer), uploadObject(medium.objectKey, medium.buffer)]);

  return { small, medium };
}

async function processWithConcurrency(items, worker) {
  let nextIndex = 0;
  const workerCount = Math.min(PROCESSING_CONCURRENCY, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;

        if (item) {
          await worker(item);
        }
      }
    }),
  );
}

async function backfillGalleryAssets(limit) {
  const assets = await prisma.galleryAsset.findMany({
    where: {
      OR: [{ smallStorageKey: null }, { mediumStorageKey: null }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      storageKey: true,
    },
  });

  await processWithConcurrency(assets, async (asset) => {
    try {
      console.log(`Processing gallery asset ${asset.id}`);
      const variants = await generateImageVariants(asset.storageKey);

      await prisma.galleryAsset.update({
        where: { id: asset.id },
        data: {
          smallStorageKey: variants.small.objectKey,
          smallWidth: variants.small.width,
          smallHeight: variants.small.height,
          smallSizeBytes: variants.small.sizeBytes,
          mediumStorageKey: variants.medium.objectKey,
          mediumWidth: variants.medium.width,
          mediumHeight: variants.medium.height,
          mediumSizeBytes: variants.medium.sizeBytes,
        },
      });
    } catch (error) {
      console.error(`Failed gallery asset ${asset.id}`, error);
    }
  });

  return assets.length;
}

async function backfillSiteContentImages(limit) {
  const rows = await prisma.siteContent.findMany({
    where: {
      imageObjectKey: { not: null },
      OR: [{ imageSmallObjectKey: null }, { imageMediumObjectKey: null }],
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: {
      key: true,
      imageObjectKey: true,
    },
  });

  await processWithConcurrency(rows, async (row) => {
    if (!row.imageObjectKey) {
      return;
    }

    try {
      console.log(`Processing site content image ${row.key}`);
      const variants = await generateImageVariants(row.imageObjectKey);

      await prisma.siteContent.updateMany({
        where: {
          key: row.key,
          imageObjectKey: row.imageObjectKey,
        },
        data: {
          imageSmallObjectKey: variants.small.objectKey,
          imageSmallWidth: variants.small.width,
          imageSmallHeight: variants.small.height,
          imageSmallSizeBytes: variants.small.sizeBytes,
          imageMediumObjectKey: variants.medium.objectKey,
          imageMediumWidth: variants.medium.width,
          imageMediumHeight: variants.medium.height,
          imageMediumSizeBytes: variants.medium.sizeBytes,
        },
      });
    } catch (error) {
      console.error(`Failed site content image ${row.key}`, error);
    }
  });

  return rows.length;
}

try {
  const limit = parseLimit();
  const [galleryCount, siteContentCount] = await Promise.all([
    backfillGalleryAssets(limit),
    backfillSiteContentImages(limit),
  ]);

  console.log(`Queued backfill complete. Gallery assets: ${galleryCount}. Site content images: ${siteContentCount}.`);
} finally {
  await prisma.$disconnect();
}
