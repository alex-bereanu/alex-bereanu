import { GalleryCategory, Prisma } from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { portfolioCategories, type PortfolioCategory } from "@/lib/site-data";
import { PUBLIC_GALLERY_CACHE_TAG } from "@/server/services/public-cache";
import { getPortfolioContentKey, getSiteContents } from "@/server/services/site-content";

const DEFAULT_WIDTH = 4;
const DEFAULT_HEIGHT = 3;
const HOMEPAGE_MOSAIC_WEDDING_POOL_SIZE = 160;
const HOMEPAGE_MOSAIC_SUPPORTING_POOL_SIZE_PER_CATEGORY = 80;
export const GALLERY_ASSET_PAGE_SIZE = 40;

type PortfolioCategorySlug = PortfolioCategory["slug"];

const galleryPhotoAssetSelect = {
  id: true,
  originalFilename: true,
  smallStorageKey: true,
  smallWidth: true,
  smallHeight: true,
  mediumStorageKey: true,
  mediumWidth: true,
  mediumHeight: true,
  largeStorageKey: true,
  largeWidth: true,
  largeHeight: true,
  placeholderDataUrl: true,
  width: true,
  height: true,
} satisfies Prisma.GalleryAssetSelect;

type GalleryPhotoAsset = Prisma.GalleryAssetGetPayload<{ select: typeof galleryPhotoAssetSelect }>;

export type GalleryPhoto = {
  id: string;
  src: string;
  smallSrc: string;
  mediumSrc: string;
  largeSrc: string;
  width: number;
  height: number;
  smallWidth?: number;
  smallHeight?: number;
  mediumWidth?: number;
  mediumHeight?: number;
  largeWidth?: number;
  largeHeight?: number;
  placeholderDataUrl?: string;
  alt: string;
  downloadHref?: string;
};

export type GalleryAssetPage = {
  photos: GalleryPhoto[];
  nextCursor: string | null;
};

export type PublicCategoryGallery = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  assetCount: number;
  photos: GalleryPhoto[];
};

type CategoryGalleryData = {
  galleries: PublicCategoryGallery[];
  showcasePhotos: GalleryPhoto[];
  galleryCount: number;
  assetCount: number;
};

type CategorySummary = {
  categorySlug: PortfolioCategorySlug;
  title: string;
  description: string;
  assetCount: number;
  galleryCount: number;
  coverPhoto?: GalleryPhoto;
};

export type HomepageMosaicPhoto = GalleryPhoto & {
  categorySlug: PortfolioCategorySlug;
  categoryTitle: string;
};

export type PublicGalleryDetail = PublicCategoryGallery & {
  categorySlug: PortfolioCategorySlug;
  categoryTitle: string;
  nextCursor: string | null;
};

const categorySlugToEnum: Record<PortfolioCategorySlug, GalleryCategory> = {
  portraits: GalleryCategory.PORTRAITS,
  automotive: GalleryCategory.AUTOMOTIVE,
  landscapes: GalleryCategory.LANDSCAPES,
  weddings: GalleryCategory.WEDDINGS,
  product: GalleryCategory.PRODUCT,
  corporate: GalleryCategory.CORPORATE,
};

const categoryEnumToSlug: Record<GalleryCategory, PortfolioCategorySlug | null> = {
  [GalleryCategory.PORTRAITS]: "portraits",
  [GalleryCategory.AUTOMOTIVE]: "automotive",
  [GalleryCategory.LANDSCAPES]: "landscapes",
  [GalleryCategory.WEDDINGS]: "weddings",
  [GalleryCategory.PRODUCT]: "product",
  [GalleryCategory.CORPORATE]: "corporate",
  [GalleryCategory.CUSTOM]: null,
};

const categoryTitleBySlug = Object.fromEntries(
  portfolioCategories.map((category) => [category.slug, category.title]),
) as Record<PortfolioCategorySlug, string>;

function normalizeDimensions(width?: number | null, height?: number | null): { width: number; height: number } {
  return {
    width: width && width > 0 ? width : DEFAULT_WIDTH,
    height: height && height > 0 ? height : DEFAULT_HEIGHT,
  };
}

function buildPublicUrl(storageKey: string): string | null {
  const base = env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}/${storageKey}` : null;
}

export function buildGalleryPhotoFromAsset(
  asset: GalleryPhotoAsset,
  alt: string,
  downloadHref?: string,
): GalleryPhoto | null {
  const smallSrc = asset.smallStorageKey ? buildPublicUrl(asset.smallStorageKey) : null;

  if (!smallSrc) return null;

  const mediumSrc = asset.mediumStorageKey ? buildPublicUrl(asset.mediumStorageKey) ?? smallSrc : smallSrc;
  const largeSrc = asset.largeStorageKey ? buildPublicUrl(asset.largeStorageKey) ?? mediumSrc : mediumSrc;
  const originalDimensions = normalizeDimensions(asset.width, asset.height);
  const smallDimensions = normalizeDimensions(asset.smallWidth ?? asset.width, asset.smallHeight ?? asset.height);
  const mediumDimensions = normalizeDimensions(asset.mediumWidth ?? asset.width, asset.mediumHeight ?? asset.height);
  const largeDimensions = normalizeDimensions(asset.largeWidth ?? asset.width, asset.largeHeight ?? asset.height);

  return {
    id: asset.id,
    src: smallSrc,
    smallSrc,
    mediumSrc,
    largeSrc,
    width: originalDimensions.width,
    height: originalDimensions.height,
    smallWidth: smallDimensions.width,
    smallHeight: smallDimensions.height,
    mediumWidth: mediumDimensions.width,
    mediumHeight: mediumDimensions.height,
    largeWidth: largeDimensions.width,
    largeHeight: largeDimensions.height,
    placeholderDataUrl: asset.placeholderDataUrl ?? undefined,
    alt,
    downloadHref,
  };
}

function mapAssetToPhoto(asset: GalleryPhotoAsset, galleryTitle: string): GalleryPhoto | null {
  return buildGalleryPhotoFromAsset(asset, `${galleryTitle} - ${asset.originalFilename}`);
}

function toPage(assets: GalleryPhotoAsset[], galleryTitle: string): GalleryAssetPage {
  const pageAssets = assets.slice(0, GALLERY_ASSET_PAGE_SIZE);
  return {
    photos: pageAssets.flatMap((asset) => {
      const photo = mapAssetToPhoto(asset, galleryTitle);
      return photo ? [photo] : [];
    }),
    nextCursor: assets.length > GALLERY_ASSET_PAGE_SIZE ? pageAssets.at(-1)?.id ?? null : null,
  };
}

const getCachedCategoryGalleries = unstable_cache(
  async (slug: PortfolioCategorySlug): Promise<CategoryGalleryData> => {
    const category = categorySlugToEnum[slug];
    const [galleries, showcaseAssets] = await Promise.all([
      prisma.gallery.findMany({
        where: { category, isActive: true, visibility: "PUBLIC" },
        orderBy: [{ updatedAt: "desc" }],
        take: 24,
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          _count: { select: { assets: { where: { status: "READY" } } } },
          assets: {
            where: { status: "READY" },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
            take: 1,
            select: galleryPhotoAssetSelect,
          },
        },
      }),
      prisma.galleryAsset.findMany({
        where: {
          status: "READY",
          gallery: { category, isActive: true, visibility: "PUBLIC" },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: GALLERY_ASSET_PAGE_SIZE,
        select: {
          ...galleryPhotoAssetSelect,
          gallery: { select: { title: true } },
        },
      }),
    ]);

    const mappedGalleries = galleries.map((gallery) => ({
      id: gallery.id,
      slug: gallery.slug,
      title: gallery.title,
      description: gallery.description,
      assetCount: gallery._count.assets,
      photos: gallery.assets.flatMap((asset) => {
        const photo = mapAssetToPhoto(asset, gallery.title);
        return photo ? [photo] : [];
      }),
    }));

    return {
      galleries: mappedGalleries,
      showcasePhotos: showcaseAssets.flatMap((asset) => {
        const photo = mapAssetToPhoto(asset, asset.gallery.title);
        return photo ? [photo] : [];
      }),
      galleryCount: mappedGalleries.length,
      assetCount: mappedGalleries.reduce((total, gallery) => total + gallery.assetCount, 0),
    };
  },
  ["public-category-galleries-v2"],
  { revalidate: 900, tags: [PUBLIC_GALLERY_CACHE_TAG] },
);

export async function getPublicCategoryGalleriesBySlug(slug: PortfolioCategorySlug): Promise<CategoryGalleryData> {
  if (!env.DATABASE_URL) return { galleries: [], showcasePhotos: [], galleryCount: 0, assetCount: 0 };
  return getCachedCategoryGalleries(slug);
}

const getCachedPublicGalleryBySlug = unstable_cache(
  async (slug: string): Promise<PublicGalleryDetail | null> => {
    const gallery = await prisma.gallery.findFirst({
      where: { slug, isActive: true, visibility: "PUBLIC" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        category: true,
        _count: { select: { assets: { where: { status: "READY" } } } },
        assets: {
          where: { status: "READY" },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          take: GALLERY_ASSET_PAGE_SIZE + 1,
          select: galleryPhotoAssetSelect,
        },
      },
    });

    if (!gallery) return null;
    const categorySlug = categoryEnumToSlug[gallery.category];
    if (!categorySlug) return null;
    const page = toPage(gallery.assets, gallery.title);

    return {
      id: gallery.id,
      slug: gallery.slug,
      title: gallery.title,
      description: gallery.description,
      assetCount: gallery._count.assets,
      photos: page.photos,
      nextCursor: page.nextCursor,
      categorySlug,
      categoryTitle: categoryTitleBySlug[categorySlug],
    };
  },
  ["public-gallery-detail-v2"],
  { revalidate: 900, tags: [PUBLIC_GALLERY_CACHE_TAG] },
);

export const getPublicGalleryBySlug = cache(async (slug: string): Promise<PublicGalleryDetail | null> => {
  if (!env.DATABASE_URL) return null;
  return getCachedPublicGalleryBySlug(slug);
});

const getCachedPublicGalleryAssetPage = unstable_cache(
  async (slug: string, cursor: string): Promise<GalleryAssetPage> => {
    const gallery = await prisma.gallery.findFirst({
      where: { slug, isActive: true, visibility: "PUBLIC" },
      select: { title: true },
    });

    if (!gallery) return { photos: [], nextCursor: null };

    const assets = await prisma.galleryAsset.findMany({
      where: {
        status: "READY",
        gallery: { slug, isActive: true, visibility: "PUBLIC" },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      cursor: { id: cursor },
      skip: 1,
      take: GALLERY_ASSET_PAGE_SIZE + 1,
      select: galleryPhotoAssetSelect,
    });

    return toPage(assets, gallery.title);
  },
  ["public-gallery-assets-v2"],
  { revalidate: 900, tags: [PUBLIC_GALLERY_CACHE_TAG] },
);

export async function getPublicGalleryAssetPage(slug: string, cursor: string): Promise<GalleryAssetPage> {
  if (!env.DATABASE_URL || !cursor) return { photos: [], nextCursor: null };
  return getCachedPublicGalleryAssetPage(slug, cursor);
}

type SummaryCountRow = {
  category: GalleryCategory;
  galleryCount: number;
  assetCount: number;
  coverAssetId: string | null;
};

const getCachedPortfolioSummaryRows = unstable_cache(
  async (): Promise<{ counts: SummaryCountRow[]; covers: Array<GalleryPhotoAsset & { gallery: { title: string } }> }> => {
    const counts = await prisma.$queryRaw<SummaryCountRow[]>`
      SELECT
        gallery."category" AS "category",
        COUNT(DISTINCT gallery."id")::int AS "galleryCount",
        COUNT(asset."id")::int AS "assetCount",
        (ARRAY_AGG(asset."id" ORDER BY asset."createdAt" DESC) FILTER (WHERE asset."id" IS NOT NULL))[1] AS "coverAssetId"
      FROM "Gallery" AS gallery
      LEFT JOIN "GalleryAsset" AS asset
        ON asset."galleryId" = gallery."id" AND asset."status" = 'READY'
      WHERE gallery."isActive" = true AND gallery."visibility" = 'PUBLIC'
      GROUP BY gallery."category"
    `;
    const coverIds = counts.flatMap((row) => (row.coverAssetId ? [row.coverAssetId] : []));
    const covers = coverIds.length
      ? await prisma.galleryAsset.findMany({
          where: { id: { in: coverIds }, status: "READY" },
          select: { ...galleryPhotoAssetSelect, gallery: { select: { title: true } } },
        })
      : [];
    return { counts, covers };
  },
  ["portfolio-summary-v2"],
  { revalidate: 900, tags: [PUBLIC_GALLERY_CACHE_TAG] },
);

export async function getPublicPortfolioCategorySummaries(
  categories: Array<{ slug: PortfolioCategorySlug; title: string; description: string }>,
): Promise<CategorySummary[]> {
  const contentKeys = categories.map((category) => getPortfolioContentKey(category.slug));

  if (!env.DATABASE_URL) {
    const contents = await getSiteContents(contentKeys);
    return categories.map((category, index) => ({
      categorySlug: category.slug,
      title: contents[index]?.title ?? category.title,
      description: contents[index]?.body ?? category.description,
      assetCount: 0,
      galleryCount: 0,
    }));
  }

  const [{ counts, covers }, contents] = await Promise.all([
    getCachedPortfolioSummaryRows(),
    getSiteContents(contentKeys),
  ]);
  const countsByCategory = new Map(counts.map((row) => [row.category, row]));
  const coversById = new Map(covers.map((cover) => [cover.id, cover]));

  return categories.map((category, index) => {
    const countsRow = countsByCategory.get(categorySlugToEnum[category.slug]);
    const coverAsset = countsRow?.coverAssetId ? coversById.get(countsRow.coverAssetId) : undefined;
    const coverPhoto = coverAsset
      ? mapAssetToPhoto(coverAsset, coverAsset.gallery.title) ?? undefined
      : undefined;
    return {
      categorySlug: category.slug,
      title: contents[index]?.title ?? category.title,
      description: contents[index]?.body ?? category.description,
      assetCount: countsRow?.assetCount ?? 0,
      galleryCount: countsRow?.galleryCount ?? 0,
      coverPhoto,
    };
  });
}

function buildHomepageMosaicPhoto(asset: GalleryPhotoAsset & { gallery: { category: GalleryCategory; title: string } }) {
  const categorySlug = categoryEnumToSlug[asset.gallery.category];
  if (!categorySlug) return null;
  const photo = mapAssetToPhoto(asset, asset.gallery.title);
  return photo ? { ...photo, categorySlug, categoryTitle: categoryTitleBySlug[categorySlug] } : null;
}

const getCachedHomepageMosaicPool = unstable_cache(
  async (): Promise<HomepageMosaicPhoto[]> => {
    const getForCategory = async (category: GalleryCategory, take: number) =>
      prisma.galleryAsset.findMany({
        where: { status: "READY", gallery: { category, isActive: true, visibility: "PUBLIC" } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take,
        select: { ...galleryPhotoAssetSelect, gallery: { select: { category: true, title: true } } },
      });
    const [weddings, portraits, places] = await Promise.all([
      getForCategory(GalleryCategory.WEDDINGS, HOMEPAGE_MOSAIC_WEDDING_POOL_SIZE),
      getForCategory(GalleryCategory.PORTRAITS, HOMEPAGE_MOSAIC_SUPPORTING_POOL_SIZE_PER_CATEGORY),
      getForCategory(GalleryCategory.LANDSCAPES, HOMEPAGE_MOSAIC_SUPPORTING_POOL_SIZE_PER_CATEGORY),
    ]);
    return [...weddings, ...portraits, ...places].flatMap((asset) => {
      const photo = buildHomepageMosaicPhoto(asset);
      return photo ? [photo] : [];
    });
  },
  ["homepage-mosaic-pool-v2"],
  { revalidate: 900, tags: [PUBLIC_GALLERY_CACHE_TAG] },
);

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export async function getPublicHomepageMosaicPhotos(): Promise<HomepageMosaicPhoto[]> {
  if (!env.DATABASE_URL) return [];
  return shuffled(await getCachedHomepageMosaicPool());
}
