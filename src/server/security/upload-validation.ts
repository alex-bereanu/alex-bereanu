import {
  formatBytes,
  MAX_ARCHIVE_SIZE_BYTES,
  MAX_GALLERY_ASSET_SIZE_BYTES,
  MAX_SITE_CONTENT_IMAGE_SIZE_BYTES,
} from "@/lib/upload-limits";

export { MAX_ARCHIVE_SIZE_BYTES, MAX_GALLERY_ASSET_SIZE_BYTES, MAX_SITE_CONTENT_IMAGE_SIZE_BYTES };

const IMAGE_MIME_BY_EXTENSION: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  avif: ["image/avif"],
};

const IMAGE_SIGNATURES: Array<{
  mimeType: string;
  matches: (bytes: Uint8Array) => boolean;
}> = [
  {
    mimeType: "image/jpeg",
    matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    mimeType: "image/png",
    matches: (bytes) =>
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
  },
  {
    mimeType: "image/webp",
    matches: (bytes) =>
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50,
  },
  {
    mimeType: "image/gif",
    matches: (bytes) =>
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) &&
      bytes[5] === 0x61,
  },
  {
    mimeType: "image/avif",
    matches: (bytes) =>
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70 &&
      bytes[8] === 0x61 &&
      bytes[9] === 0x76 &&
      bytes[10] === 0x69 &&
      bytes[11] === 0x66,
  },
];

export function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.trim().toLowerCase() ?? "";
}

export function sanitizeFilename(filename: string): string {
  return filename
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function validateImageUploadMetadata(input: {
  filename: string;
  contentType: string;
  sizeBytes?: number;
  maxSizeBytes?: number;
}): string | null {
  const extension = getFileExtension(input.filename);
  if (extension === "heic" || extension === "heif" || /hei[cf]/i.test(input.contentType)) {
    return "HEIC and HEIF are not accepted. Export the image as JPG before uploading.";
  }
  const allowedMimeTypes = IMAGE_MIME_BY_EXTENSION[extension];

  if (!allowedMimeTypes || !allowedMimeTypes.includes(input.contentType.toLowerCase())) {
    return "Only JPG, PNG, WebP, GIF, or AVIF images are supported.";
  }

  if (input.sizeBytes !== undefined) {
    const maxSizeBytes = input.maxSizeBytes ?? MAX_GALLERY_ASSET_SIZE_BYTES;

    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > maxSizeBytes) {
      return `Image must be larger than 0 bytes and no more than ${formatBytes(maxSizeBytes)}.`;
    }
  }

  return null;
}

export function validateImageFileSignature(bytes: Uint8Array, expectedContentType: string): string | null {
  const detectedSignature = IMAGE_SIGNATURES.find((signature) => signature.matches(bytes));

  if (!detectedSignature) {
    return "Uploaded file does not look like a supported image.";
  }

  if (detectedSignature.mimeType !== expectedContentType.toLowerCase()) {
    return "Uploaded image content does not match its declared type.";
  }

  return null;
}

export function validateZipUploadMetadata(input: {
  filename: string;
  contentType: string;
  sizeBytes?: number;
}): string | null {
  const contentType = input.contentType.toLowerCase();

  if (getFileExtension(input.filename) !== "zip") {
    return "Archive must be a .zip file.";
  }

  if (!["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(contentType)) {
    return "Archive must use a ZIP content type.";
  }

  if (input.sizeBytes !== undefined) {
    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_ARCHIVE_SIZE_BYTES) {
      return `Archive must be larger than 0 bytes and no more than ${formatBytes(MAX_ARCHIVE_SIZE_BYTES)}.`;
    }
  }

  return null;
}

export function validateZipFileSignature(bytes: Uint8Array): string | null {
  const isZip =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08));

  return isZip ? null : "Uploaded archive does not look like a ZIP file.";
}
