import "server-only";

import { revalidateTag } from "next/cache";

export const PUBLIC_GALLERY_CACHE_TAG = "public-galleries";
export const SITE_CONTENT_CACHE_TAG = "site-content";

export function invalidatePublicGalleryCache(): void {
  revalidateTag(PUBLIC_GALLERY_CACHE_TAG, { expire: 0 });
}

export function invalidateSiteContentCache(): void {
  revalidateTag(SITE_CONTENT_CACHE_TAG, { expire: 0 });
}
