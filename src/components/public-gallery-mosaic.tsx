"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

import { useMobileImageVariant } from "./use-mobile-image-variant";

type PublicGalleryMosaicPhoto = {
  id: string;
  src: string;
  smallSrc?: string;
  mediumSrc?: string;
  width: number;
  height: number;
  smallWidth?: number;
  smallHeight?: number;
  mediumWidth?: number;
  mediumHeight?: number;
  alt: string;
};

type PublicGalleryMosaicProps = {
  photos: PublicGalleryMosaicPhoto[];
  desktopMode?: "continuous" | "hero";
};

const DESKTOP_COLUMN_COUNT = 5;
const MAX_GRID_ROWS = 8;
const MAX_GRID_PHOTO_COUNT = DESKTOP_COLUMN_COUNT * MAX_GRID_ROWS;
const INITIAL_VISIBLE_COUNT = DESKTOP_COLUMN_COUNT * 2;
const CONTINUOUS_EAGER_IMAGE_COUNT = DESKTOP_COLUMN_COUNT * 3;
const IMAGE_QUALITY = 75;

export function PublicGalleryMosaic({ photos, desktopMode = "continuous" }: PublicGalleryMosaicProps) {
  const [index, setIndex] = useState<number>(-1);
  const isMobileLightbox = useMobileImageVariant();
  const gridPhotos = useMemo(() => photos.slice(0, MAX_GRID_PHOTO_COUNT), [photos]);
  const highPriorityPhotoCount = desktopMode === "hero" ? INITIAL_VISIBLE_COUNT : DESKTOP_COLUMN_COUNT;
  const eagerPhotoCount = desktopMode === "hero" ? DESKTOP_COLUMN_COUNT * 4 : CONTINUOUS_EAGER_IMAGE_COUNT;

  const slides = useMemo(
    () =>
      gridPhotos.map((photo) => ({
        src: isMobileLightbox ? photo.smallSrc ?? photo.src : photo.mediumSrc ?? photo.smallSrc ?? photo.src,
        width: isMobileLightbox ? photo.smallWidth ?? photo.width : photo.mediumWidth ?? photo.width,
        height: isMobileLightbox ? photo.smallHeight ?? photo.height : photo.mediumHeight ?? photo.height,
        alt: photo.alt,
        thumbnail: photo.smallSrc ?? photo.src,
      })),
    [gridPhotos, isMobileLightbox],
  );

  if (photos.length === 0) {
    return (
      <section className="rounded bg-neutral-50 p-8 shadow-[0_12px_30px_rgba(23,18,15,0.06)]">
        <p className="text-sm text-neutral-700">No photos published in this gallery yet.</p>
      </section>
    );
  }

  return (
    <>
      <div className="grid w-full grid-cols-2 overflow-hidden sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {gridPhotos.map((photo, photoIndex) => (
          <button
            key={photo.id}
            type="button"
            className="relative block aspect-[4/5] w-full overflow-hidden bg-neutral-100"
            onClick={() => setIndex(photoIndex)}
            aria-label={`Open ${photo.alt}`}
          >
            <Image
              src={photo.smallSrc ?? photo.src}
              alt={photo.alt}
              fill
              sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover"
              quality={IMAGE_QUALITY}
              loading={photoIndex < eagerPhotoCount ? "eager" : "lazy"}
              fetchPriority={photoIndex < highPriorityPhotoCount ? "high" : "auto"}
            />
          </button>
        ))}
      </div>

      <Lightbox
        className="editorial-lightbox"
        index={index}
        open={index >= 0}
        close={() => setIndex(-1)}
        slides={slides}
        plugins={[Zoom, Thumbnails]}
        carousel={{ imageFit: "contain" }}
        controller={{ closeOnBackdropClick: true }}
      />
    </>
  );
}
