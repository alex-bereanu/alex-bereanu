import { GalleryCategory } from "@prisma/client";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { portfolioCategories, type PortfolioCategory } from "@/lib/site-data";
import { getPortfolioContentKey, getSiteContent } from "@/server/services/site-content";

const DEFAULT_WIDTH = 4;
const DEFAULT_HEIGHT = 3;
const HOMEPAGE_MOSAIC_WEDDING_POOL_SIZE = 160;
const HOMEPAGE_MOSAIC_SUPPORTING_POOL_SIZE_PER_CATEGORY = 80;

type PortfolioCategorySlug = PortfolioCategory["slug"];

export type GalleryPhoto = {
  id: string;
  src: string;
  smallSrc: string;
  mediumSrc: string;
  width: number;
  height: number;
  smallWidth?: number;
  smallHeight?: number;
  mediumWidth?: number;
  mediumHeight?: number;
  alt: string;
  downloadHref?: string;
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
  const safeWidth = width && width > 0 ? width : DEFAULT_WIDTH;
  const safeHeight = height && height > 0 ? height : DEFAULT_HEIGHT;

  return { width: safeWidth, height: safeHeight };
}

function getPublicBaseUrl(): string | null {
  return env.R2_PUBLIC_BASE_URL ? env.R2_PUBLIC_BASE_URL.replace(/\/$/, "") : null;
}

function buildPublicUrl(storageKey: string): string | null {
  const base = getPublicBaseUrl();
  return base ? `${base}/${storageKey}` : null;
}

export function buildGalleryPhotoFromAsset(
  asset: {
    id: string;
    storageKey: string;
    smallStorageKey: string | null;
    smallWidth: number | null;
    smallHeight: number | null;
    mediumStorageKey: string | null;
    mediumWidth: number | null;
    mediumHeight: number | null;
    width: number | null;
    height: number | null;
  },
  alt: string,
  downloadHref?: string,
): GalleryPhoto | null {
  const originalSrc = buildPublicUrl(asset.storageKey);

  if (!originalSrc) {
    return null;
  }

  const smallSrc = asset.smallStorageKey ? buildPublicUrl(asset.smallStorageKey) ?? originalSrc : originalSrc;
  const mediumSrc = asset.mediumStorageKey ? buildPublicUrl(asset.mediumStorageKey) ?? smallSrc : smallSrc;
  const { width, height } = normalizeDimensions(asset.width, asset.height);
  const smallDimensions = normalizeDimensions(asset.smallWidth ?? asset.width, asset.smallHeight ?? asset.height);
  const mediumDimensions = normalizeDimensions(asset.mediumWidth ?? asset.width, asset.mediumHeight ?? asset.height);

  return {
    id: asset.id,
    src: smallSrc,
    smallSrc,
    mediumSrc,
    width,
    height,
    smallWidth: smallDimensions.width,
    smallHeight: smallDimensions.height,
    mediumWidth: mediumDimensions.width,
    mediumHeight: mediumDimensions.height,
    alt,
    downloadHref,
  };
}

function buildHomepageMosaicPhoto(asset: {
  id: string;
  storageKey: string;
  smallStorageKey: string | null;
  smallWidth: number | null;
  smallHeight: number | null;
  mediumStorageKey: string | null;
  mediumWidth: number | null;
  mediumHeight: number | null;
  width: number | null;
  height: number | null;
  originalFilename: string;
  gallery: {
    category: GalleryCategory;
    title: string;
  };
}): HomepageMosaicPhoto | null {
  const categorySlug = categoryEnumToSlug[asset.gallery.category];

  if (!categorySlug) {
    return null;
  }

  const photo = buildGalleryPhotoFromAsset(asset, `${asset.gallery.title} - ${asset.originalFilename}`);

  if (!photo) {
    return null;
  }

  return {
    ...photo,
    categorySlug,
    categoryTitle: categoryTitleBySlug[categorySlug],
  };
}

async function getHomepageMosaicPhotosForCategory(category: GalleryCategory, take: number): Promise<HomepageMosaicPhoto[]> {
  const assets = await prisma.galleryAsset.findMany({
    where: {
      gallery: {
        category,
        isActive: true,
        visibility: "PUBLIC",
      },
    },
    include: {
      gallery: {
        select: {
          category: true,
          title: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take,
  });

  return assets.flatMap((asset) => {
    const photo = buildHomepageMosaicPhoto(asset);
    return photo ? [photo] : [];
  });
}

function shuffled<T>(items: T[]): T[] {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return nextItems;
}

export async function getPublicCategoryGalleriesBySlug(slug: PortfolioCategorySlug): Promise<CategoryGalleryData> {
  if (!env.DATABASE_URL) {
    return { galleries: [], galleryCount: 0, assetCount: 0 };
  }

  const category = categorySlugToEnum[slug];

  const galleries = await prisma.gallery.findMany({
    where: {
      category,
      isActive: true,
      visibility: "PUBLIC",
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      assets: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    take: 24,
  });

  let assetCount = 0;

  const categoryGalleries: PublicCategoryGallery[] = galleries.map((gallery) => {
    const photos: GalleryPhoto[] = [];

    for (const asset of gallery.assets) {
      assetCount += 1;

      const photo = buildGalleryPhotoFromAsset(asset, `${gallery.title} - ${asset.originalFilename}`);

      if (photo) {
        photos.push(photo);
      }
    }

    return {
      id: gallery.id,
      slug: gallery.slug,
      title: gallery.title,
      description: gallery.description,
      assetCount: gallery.assets.length,
      photos,
    };
  });

  return {
    galleries: categoryGalleries,
    galleryCount: galleries.length,
    assetCount,
  };
}

export async function getPublicGalleryBySlug(slug: string): Promise<PublicGalleryDetail | null> {
  if (!env.DATABASE_URL) {
    return null;
  }

  const gallery = await prisma.gallery.findFirst({
    where: {
      slug,
      isActive: true,
      visibility: "PUBLIC",
    },
    include: {
      assets: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!gallery) {
    return null;
  }

  const categorySlug = categoryEnumToSlug[gallery.category];

  if (!categorySlug) {
    return null;
  }

  const photos: GalleryPhoto[] = [];

  for (const asset of gallery.assets) {
    const photo = buildGalleryPhotoFromAsset(asset, `${gallery.title} - ${asset.originalFilename}`);

    if (photo) {
      photos.push(photo);
    }
  }

  return {
    id: gallery.id,
    slug: gallery.slug,
    title: gallery.title,
    description: gallery.description,
    assetCount: gallery.assets.length,
    photos,
    categorySlug,
    categoryTitle: categoryTitleBySlug[categorySlug],
  };
}

export async function getPublicPortfolioCategorySummaries(categories: Array<{
  slug: PortfolioCategorySlug;
  title: string;
  description: string;
}>): Promise<CategorySummary[]> {
  if (!env.DATABASE_URL) {
    return Promise.all(
      categories.map(async (category) => {
        const content = await getSiteContent(getPortfolioContentKey(category.slug));

        return {
          categorySlug: category.slug,
          title: content.title,
          description: content.body,
          assetCount: 0,
          galleryCount: 0,
          coverPhoto: undefined,
        };
      }),
    );
  }

  const results = await Promise.all(
    categories.map(async (category) => {
      const content = await getSiteContent(getPortfolioContentKey(category.slug));
      const dbCategory = categorySlugToEnum[category.slug];

      const [assetCount, galleryCount, coverAsset] = await Promise.all([
        prisma.galleryAsset.count({
          where: {
            gallery: {
              category: dbCategory,
              isActive: true,
              visibility: "PUBLIC",
            },
          },
        }),
        prisma.gallery.count({
          where: {
            category: dbCategory,
            isActive: true,
            visibility: "PUBLIC",
          },
        }),
        prisma.galleryAsset.findFirst({
          where: {
            gallery: {
              category: dbCategory,
              isActive: true,
              visibility: "PUBLIC",
            },
          },
          include: {
            gallery: {
              select: {
                title: true,
              },
            },
          },
          orderBy: [{ createdAt: "desc" }],
        }),
      ]);

      const coverPhoto = coverAsset
        ? buildGalleryPhotoFromAsset(coverAsset, `${coverAsset.gallery.title} - ${coverAsset.originalFilename}`) ?? undefined
        : undefined;

      return {
        categorySlug: category.slug,
        title: content.title,
        description: content.body,
        assetCount,
        galleryCount,
        coverPhoto,
      };
    }),
  );

  return results;
}

export async function getPublicHomepageMosaicPhotos(): Promise<HomepageMosaicPhoto[]> {
  if (!env.DATABASE_URL) {
    return [];
  }

  const [weddingPhotos, portraitPhotos, placesPhotos] = await Promise.all([
    getHomepageMosaicPhotosForCategory(GalleryCategory.WEDDINGS, HOMEPAGE_MOSAIC_WEDDING_POOL_SIZE),
    getHomepageMosaicPhotosForCategory(GalleryCategory.PORTRAITS, HOMEPAGE_MOSAIC_SUPPORTING_POOL_SIZE_PER_CATEGORY),
    getHomepageMosaicPhotosForCategory(GalleryCategory.LANDSCAPES, HOMEPAGE_MOSAIC_SUPPORTING_POOL_SIZE_PER_CATEGORY),
  ]);

  return shuffled([...weddingPhotos, ...portraitPhotos, ...placesPhotos]);
}
