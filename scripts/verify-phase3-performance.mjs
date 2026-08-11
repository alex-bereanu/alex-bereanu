import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = (path) => readFile(resolve(process.cwd(), path), "utf8");

function includesAll(value, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(value.includes(fragment), `${label} is missing: ${fragment}`);
  }
}

const [
  publicGallery,
  privateGallery,
  publicPageRoute,
  privatePageRoute,
  publicMosaic,
  galleryGrid,
  responsiveImage,
  overlay,
  homepageMosaic,
  adminPage,
  adminGalleryWorkspace,
  adminAssetsRoute,
  siteContent,
  turnstile,
  cacheService,
] = await Promise.all([
  source("src/server/services/public-gallery.ts"),
  source("src/server/services/gallery-access.ts"),
  source("src/app/api/public-galleries/[slug]/assets/route.ts"),
  source("src/app/api/gallery-media/assets/route.ts"),
  source("src/components/public-gallery-mosaic.tsx"),
  source("src/components/gallery-lightbox.tsx"),
  source("src/components/responsive-gallery-image.tsx"),
  source("src/components/gallery-lightbox-overlay.tsx"),
  source("src/components/homepage-hero-mosaic.tsx"),
  source("src/app/admin/galleries/page.tsx"),
  source("src/app/admin/galleries/[galleryId]/page.tsx"),
  source("src/app/admin/actions/galleries/assets-page/route.ts"),
  source("src/server/services/site-content.ts"),
  source("src/components/turnstile-field.tsx"),
  source("src/server/services/public-cache.ts"),
]);

includesAll(publicGallery, ["GALLERY_ASSET_PAGE_SIZE = 40", "GALLERY_ASSET_PAGE_SIZE + 1", "cursor: { id: cursor }", "unstable_cache", "cache(async", "getSiteContents(contentKeys)"], "public data boundary");
includesAll(privateGallery, ["PRIVATE_GALLERY_PAGE_SIZE = 40", "PRIVATE_GALLERY_PAGE_SIZE + 1", "getPrivateGalleryAssetPage", "cursor: { id: cursor }"], "private data boundary");
includesAll(publicPageRoute, ["getPublicGalleryAssetPage", '"Cache-Control": "no-store"'], "public pagination route");
includesAll(privatePageRoute, ["getPrivateGalleryAssetPage", '"Cache-Control": "private, no-store, max-age=0"', 'Vary: "Cookie"'], "private pagination route");
includesAll(publicMosaic, ["dynamic(", "gallery-lightbox-overlay", "Load more photos", 'photoIndex === 0 ? "high"'], "public gallery client");
includesAll(galleryGrid, ["dynamic(", "gallery-lightbox-overlay", "Load More Photos", 'photoIndex === 0 ? "high"'], "gallery grid client");
includesAll(responsiveImage, ["<picture", "<source", "srcSet={srcSet}", "mediumSrc", "smallWidth", "mediumWidth", "unoptimized"], "responsive pre-generated image delivery");
includesAll(publicMosaic, ["ResponsiveGalleryImage", "mediumSrc={photo.mediumSrc}"], "public responsive gallery grid");
includesAll(galleryGrid, ["ResponsiveGalleryImage", "mediumSrc={photo.mediumSrc}"], "private responsive gallery grid");
includesAll(homepageMosaic, ["PublicGalleryMosaic"], "homepage responsive gallery delegation");
assert.ok(!publicMosaic.includes("yet-another-react-lightbox"), "public grid must not statically import the lightbox library");
assert.ok(!galleryGrid.includes("yet-another-react-lightbox"), "gallery grid must not statically import the lightbox library");
includesAll(overlay, ["yet-another-react-lightbox", "plugins/zoom", "plugins/thumbnails"], "interaction-only lightbox chunk");
assert.ok(!overlay.includes("DownloadAll"), "bulk photo downloads must use the gallery ZIP, not request storms");
assert.ok(!homepageMosaic.includes('"use client"'), "homepage mosaic must remain a Server Component");
assert.ok(!homepageMosaic.includes("useMemo"), "homepage mosaic layout must be computed on the server");
includesAll(adminPage, ["PAGE_SIZE = 30", "take: PAGE_SIZE", "select:", "Manage"], "summary-only admin gallery index");
assert.ok(!adminPage.includes("AdminAssetManager"), "gallery index must not load the asset manager client bundle");
assert.ok(!adminPage.includes("smallStorageKey"), "gallery index must not query or serialize gallery assets");
includesAll(adminGalleryWorkspace, ['activeTab === "photos"', "take: 41", "initialNextCursor", "AdminAssetManager"], "bounded gallery photo workspace");
includesAll(adminAssetsRoute, ["PAGE_SIZE = 40", "cursor: { id: cursor }", '"Cache-Control": "private, no-store, max-age=0"'], "admin pagination route");
includesAll(siteContent, ["getSiteContents", "getCachedSiteContentRows", "SITE_CONTENT_CACHE_TAG", "cache(async"], "batched site content");
includesAll(turnstile, ["IntersectionObserver", 'rootMargin: "300px 0px"', "shouldLoad"], "deferred Turnstile");
includesAll(cacheService, ["revalidateTag", "PUBLIC_GALLERY_CACHE_TAG", "SITE_CONTENT_CACHE_TAG", "expire: 0"], "explicit cache invalidation");

console.log("Phase 3 performance verification passed (bounded cursors, cached/batched reads, deferred interaction code, and priority controls).\n");
