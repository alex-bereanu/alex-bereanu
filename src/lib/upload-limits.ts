export const BYTES_PER_MEGABYTE = 1024 * 1024;

export const MAX_GALLERY_ASSET_UPLOAD_COUNT = 2000;
export const MAX_GALLERY_ASSET_SIZE_BYTES = 100 * BYTES_PER_MEGABYTE;
export const MAX_SITE_CONTENT_IMAGE_SIZE_BYTES = 12 * BYTES_PER_MEGABYTE;
export const MAX_ARCHIVE_SIZE_BYTES = 1024 * BYTES_PER_MEGABYTE;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 MB";
  }

  const megabytes = bytes / BYTES_PER_MEGABYTE;
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}
