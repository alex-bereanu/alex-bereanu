import "server-only";

import { revalidateTag } from "next/cache";

export const PUBLIC_GALLERY_CACHE_TAG = "public-galleries";
export const SITE_CONTENT_CACHE_TAG = "site-content";

export function siteContentCacheTag(key: string): string {
  return `${SITE_CONTENT_CACHE_TAG}:${key}`.slice(0, 256);
}

export function invalidatePublicGalleryCache(): void {
  revalidateTag(PUBLIC_GALLERY_CACHE_TAG, { expire: 0 });
}

export function invalidateSiteContentCache(): void {
  revalidateTag(SITE_CONTENT_CACHE_TAG, { expire: 0 });
}

export function invalidateSiteContentKey(key: string): void {
  revalidateTag(siteContentCacheTag(key), { expire: 0 });
}
