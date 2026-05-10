"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import type { HomepageMosaicPhoto } from "@/server/services/public-gallery";

const DESKTOP_COLUMN_COUNT = 5;
const MAX_GRID_ROWS = 8;
const MAX_GRID_PHOTO_COUNT = DESKTOP_COLUMN_COUNT * MAX_GRID_ROWS;
const INITIAL_VISIBLE_COUNT = DESKTOP_COLUMN_COUNT * 2;
const EAGER_IMAGE_COUNT = DESKTOP_COLUMN_COUNT * 4;
const IMAGE_QUALITY = 75;
const WEDDING_CATEGORY_SLUG = "weddings";
const PORTRAIT_CATEGORY_SLUG = "portraits";
const PLACES_CATEGORY_SLUG = "landscapes";
const HOMEPAGE_CATEGORY_PATTERN: HomepageMosaicPhoto["categorySlug"][] = [
  WEDDING_CATEGORY_SLUG,
  WEDDING_CATEGORY_SLUG,
  WEDDING_CATEGORY_SLUG,
  WEDDING_CATEGORY_SLUG,
  WEDDING_CATEGORY_SLUG,
  PORTRAIT_CATEGORY_SLUG,
  WEDDING_CATEGORY_SLUG,
  WEDDING_CATEGORY_SLUG,
  PLACES_CATEGORY_SLUG,
  WEDDING_CATEGORY_SLUG,
];
const HOMEPAGE_ALLOWED_CATEGORIES: HomepageMosaicPhoto["categorySlug"][] = [
  WEDDING_CATEGORY_SLUG,
  PORTRAIT_CATEGORY_SLUG,
  PLACES_CATEGORY_SLUG,
];

function groupPhotosByCategory(photos: HomepageMosaicPhoto[]) {
  const photosByCategory = new Map<HomepageMosaicPhoto["categorySlug"], HomepageMosaicPhoto[]>();

  for (const photo of photos) {
    if (!HOMEPAGE_ALLOWED_CATEGORIES.includes(photo.categorySlug)) {
      continue;
    }

    const categoryPhotos = photosByCategory.get(photo.categorySlug) ?? [];
    categoryPhotos.push(photo);
    photosByCategory.set(photo.categorySlug, categoryPhotos);
  }

  return photosByCategory;
}

function takePhotoForCategory(
  photosByCategory: Map<HomepageMosaicPhoto["categorySlug"], HomepageMosaicPhoto[]>,
  category: HomepageMosaicPhoto["categorySlug"],
) {
  return photosByCategory.get(category)?.shift();
}

function takeFallbackPhoto(photosByCategory: Map<HomepageMosaicPhoto["categorySlug"], HomepageMosaicPhoto[]>) {
  for (const category of HOMEPAGE_ALLOWED_CATEGORIES) {
    const photo = takePhotoForCategory(photosByCategory, category);

    if (photo) {
      return photo;
    }
  }
}

function buildHomepageGrid(photos: HomepageMosaicPhoto[]) {
  const photosByCategory = groupPhotosByCategory(photos);
  const grid: HomepageMosaicPhoto[] = [];

  while (grid.length < MAX_GRID_PHOTO_COUNT) {
    const category = HOMEPAGE_CATEGORY_PATTERN[grid.length % HOMEPAGE_CATEGORY_PATTERN.length];
    const nextPhoto = takePhotoForCategory(photosByCategory, category) ?? takeFallbackPhoto(photosByCategory);

    if (!nextPhoto) {
      break;
    }

    grid.push(nextPhoto);
  }

  return grid;
}

type HomepageHeroMosaicProps = {
  photos: HomepageMosaicPhoto[];
};

export function HomepageHeroMosaic({ photos }: HomepageHeroMosaicProps) {
  const gridPhotos = useMemo(() => buildHomepageGrid(photos), [photos]);

  return (
    <section id="hero" className="w-full bg-white px-0">
      <div className="grid w-full grid-cols-2 overflow-hidden sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {gridPhotos.length > 0
          ? gridPhotos.map((photo, index) => (
              <Link
                key={`${photo.id}-${index}`}
                href={`/portfolio/${photo.categorySlug}`}
                className="relative block aspect-[4/5] overflow-hidden bg-neutral-100"
                aria-label={`Open ${photo.categoryTitle} portfolio`}
              >
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover"
                  quality={IMAGE_QUALITY}
                  loading={index < EAGER_IMAGE_COUNT ? "eager" : "lazy"}
                  fetchPriority={index < INITIAL_VISIBLE_COUNT ? "high" : "auto"}
                />
              </Link>
            ))
          : Array.from({ length: INITIAL_VISIBLE_COUNT }).map((_, index) => (
              <div key={index} className="aspect-[4/5] bg-[linear-gradient(135deg,#fafafa,#d4d4d4)]" />
          ))}
      </div>
    </section>
  );
}
