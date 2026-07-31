import sharp from "sharp";

import { prisma } from "@/lib/db";
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXEL_COUNT } from "@/lib/upload-limits";
import {
  deleteObjectByKey,
  getObjectBuffer,
  getStorageAreaForGalleryVisibility,
  type StorageArea,
  uploadObject,
} from "@/server/services/storage";

const SMALL_IMAGE_MAX_SIZE = 480;
const MEDIUM_IMAGE_MAX_SIZE = 1600;
const SMALL_IMAGE_QUALITY = 72;
const MEDIUM_IMAGE_QUALITY = 80;
const VARIANT_CONTENT_TYPE = "image/webp";
const PROCESSING_CONCURRENCY = 2;

type GeneratedVariant = {
  objectKey: string;
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: bigint;
};

type GeneratedVariants = {
  small: GeneratedVariant;
  medium: GeneratedVariant;
};

function getObjectKeyParts(objectKey: string): { directory: string; basename: string } {
  const slashIndex = objectKey.lastIndexOf("/");
  const directory = slashIndex >= 0 ? objectKey.slice(0, slashIndex) : "";
  const filename = slashIndex >= 0 ? objectKey.slice(slashIndex + 1) : objectKey;
  const extensionIndex = filename.lastIndexOf(".");
  const basename = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;

  return {
    directory,
    basename: basename || "image",
  };
}

function buildVariantObjectKey(originalObjectKey: string, variant: "small" | "medium"): string {
  const { directory, basename } = getObjectKeyParts(originalObjectKey);
  const prefix = directory ? `${directory}/variants` : "variants";

  return `${prefix}/${basename}-${variant}.webp`;
}

async function generateVariant(input: {
  originalBuffer: Buffer;
  originalObjectKey: string;
  variant: "small" | "medium";
  maxSize: number;
  quality: number;
}): Promise<GeneratedVariant> {
  const { data, info } = await sharp(input.originalBuffer, {
    animated: false,
    failOn: "warning",
    limitInputPixels: MAX_IMAGE_PIXEL_COUNT,
  })
    .rotate()
    .resize({
      width: input.maxSize,
      height: input.maxSize,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: input.quality,
      effort: 5,
    })
    .toBuffer({ resolveWithObject: true });

  return {
    objectKey: buildVariantObjectKey(input.originalObjectKey, input.variant),
    buffer: data,
    width: info.width,
    height: info.height,
    sizeBytes: BigInt(info.size),
  };
}

async function generateImageVariants(originalBuffer: Buffer, originalObjectKey: string): Promise<GeneratedVariants> {
  const metadata = await sharp(originalBuffer, {
    animated: false,
    failOn: "warning",
    limitInputPixels: MAX_IMAGE_PIXEL_COUNT,
  }).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (
    !width ||
    !height ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXEL_COUNT ||
    (metadata.pages ?? 1) > 1
  ) {
    throw new Error("site_content_image_dimensions_or_animation_rejected");
  }

  const [small, medium] = await Promise.all([
    generateVariant({
      originalBuffer,
      originalObjectKey,
      variant: "small",
      maxSize: SMALL_IMAGE_MAX_SIZE,
      quality: SMALL_IMAGE_QUALITY,
    }),
    generateVariant({
      originalBuffer,
      originalObjectKey,
      variant: "medium",
      maxSize: MEDIUM_IMAGE_MAX_SIZE,
      quality: MEDIUM_IMAGE_QUALITY,
    }),
  ]);

  return { small, medium };
}

export async function prepareSiteContentImageVariants(
  originalBuffer: Buffer,
  objectKeySeed: string,
): Promise<GeneratedVariants> {
  const variants = await generateImageVariants(originalBuffer, objectKeySeed);
  try {
    await uploadVariants(variants, "PUBLIC");
  } catch (error) {
    await Promise.allSettled([
      deleteObjectByKey(variants.small.objectKey, "PUBLIC"),
      deleteObjectByKey(variants.medium.objectKey, "PUBLIC"),
    ]);
    throw error;
  }
  return variants;
}

async function uploadVariants(variants: GeneratedVariants, area: StorageArea): Promise<void> {
  await Promise.all([
    uploadObject({
      area,
      objectKey: variants.small.objectKey,
      contentType: VARIANT_CONTENT_TYPE,
      body: variants.small.buffer,
    }),
    uploadObject({
      area,
      objectKey: variants.medium.objectKey,
      contentType: VARIANT_CONTENT_TYPE,
      body: variants.medium.buffer,
    }),
  ]);
}

async function processWithConcurrency<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(PROCESSING_CONCURRENCY, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;

        if (item !== undefined) {
          await worker(item);
        }
      }
    }),
  );
}

async function processGalleryAssetVariant(asset: {
  id: string;
  storageKey: string;
  smallStorageKey: string | null;
  mediumStorageKey: string | null;
  gallery: { visibility: "PUBLIC" | "PRIVATE" };
}): Promise<void> {
  if (asset.smallStorageKey && asset.mediumStorageKey) {
    return;
  }

  const storageArea = getStorageAreaForGalleryVisibility(asset.gallery.visibility);
  const originalBuffer = await getObjectBuffer(asset.storageKey, storageArea);
  const variants = await generateImageVariants(originalBuffer, asset.storageKey);

  await uploadVariants(variants, storageArea);

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
}

export async function processGalleryAssetVariants(assetIds: string[]): Promise<void> {
  if (assetIds.length === 0) {
    return;
  }

  const assets = await prisma.galleryAsset.findMany({
    where: {
      id: {
        in: assetIds,
      },
    },
    select: {
      id: true,
      storageKey: true,
      smallStorageKey: true,
      mediumStorageKey: true,
      gallery: {
        select: { visibility: true },
      },
    },
  });

  await processWithConcurrency(assets, async (asset) => {
    try {
      await processGalleryAssetVariant(asset);
    } catch (error) {
      console.error(`Unable to process gallery asset variants for ${asset.id}.`, error);
    }
  });
}

export async function processSiteContentImageVariants(key: string, objectKey: string): Promise<void> {
  try {
    const originalBuffer = await getObjectBuffer(objectKey);
    const variants = await generateImageVariants(originalBuffer, objectKey);

    await uploadVariants(variants, "PUBLIC");

    await prisma.siteContent.updateMany({
      where: {
        key,
        imageObjectKey: objectKey,
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
    console.error(`Unable to process site content image variants for ${key}.`, error);
  }
}
