"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import PhotoAlbum, { type Photo } from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import Download from "yet-another-react-lightbox/plugins/download";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

import { useMobileImageVariant } from "./use-mobile-image-variant";

type PhotoGalleryItem = {
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
  downloadHref?: string;
};

type GalleryLightboxProps = {
  photos: PhotoGalleryItem[];
  batchSize?: number;
  initialCount?: number;
  revealOnScroll?: boolean;
  spacing?: number;
  targetRowHeight?: number;
};

const IMAGE_QUALITY = 75;

export function GalleryLightbox({
  photos,
  batchSize = 12,
  initialCount,
  revealOnScroll = false,
  spacing = 10,
  targetRowHeight = 240,
}: GalleryLightboxProps) {
  const [index, setIndex] = useState<number>(-1);
  const isMobileLightbox = useMobileImageVariant();
  const revealTargetRef = useRef<HTMLDivElement | null>(null);
  const resolvedInitialCount = initialCount ?? photos.length;
  const [visibleCount, setVisibleCount] = useState(() =>
    revealOnScroll ? Math.min(resolvedInitialCount, photos.length) : photos.length,
  );

  useEffect(() => {
    if (!revealOnScroll || visibleCount >= photos.length) {
      return;
    }

    const target = revealTargetRef.current;

    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisibleCount((currentCount) => Math.min(currentCount + batchSize, photos.length));
        }
      },
      { rootMargin: "700px 0px" },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [batchSize, photos.length, revealOnScroll, visibleCount]);

  const visiblePhotos = revealOnScroll ? photos.slice(0, visibleCount) : photos;
  const eagerPhotoCount = Math.min(24, visiblePhotos.length);
  const highPriorityPhotoCount = Math.min(12, eagerPhotoCount);

  const photoAlbumItems: Photo[] = useMemo(
    () =>
      visiblePhotos.map((photo) => ({
        key: photo.id,
        src: photo.smallSrc ?? photo.src,
        width: photo.width,
        height: photo.height,
        alt: photo.alt,
      })),
    [visiblePhotos],
  );

  const slides = useMemo(
    () =>
      photos.map((photo) => ({
        src: isMobileLightbox ? photo.smallSrc ?? photo.src : photo.mediumSrc ?? photo.smallSrc ?? photo.src,
        width: isMobileLightbox ? photo.smallWidth ?? photo.width : photo.mediumWidth ?? photo.width,
        height: isMobileLightbox ? photo.smallHeight ?? photo.height : photo.mediumHeight ?? photo.height,
        alt: photo.alt,
        thumbnail: photo.smallSrc ?? photo.src,
        download: photo.downloadHref
          ? {
              url: photo.downloadHref,
              filename: photo.alt,
            }
          : undefined,
      })),
    [isMobileLightbox, photos],
  );
  const plugins = photos.some((photo) => photo.downloadHref) ? [Zoom, Thumbnails, Download] : [Zoom, Thumbnails];

  if (photoAlbumItems.length === 0) {
    return (
      <section className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-8">
        <p className="text-sm text-neutral-700">No photos published in this section yet.</p>
      </section>
    );
  }

  return (
    <>
      <PhotoAlbum
        photos={photoAlbumItems}
        layout="rows"
        spacing={spacing}
        targetRowHeight={targetRowHeight}
        render={{
          image: (
            { src, alt, title, sizes, className, style, loading, fetchPriority, decoding },
            { width, height },
          ) => (
            <Image
              src={src as string}
              alt={alt ?? ""}
              title={title}
              width={Math.max(1, Math.round(width))}
              height={Math.max(1, Math.round(height))}
              sizes={sizes}
              className={className}
              style={style}
              loading={loading}
              fetchPriority={fetchPriority}
              decoding={decoding}
              quality={IMAGE_QUALITY}
            />
          ),
        }}
        componentsProps={{
          image: ({ index }) => ({
            loading: index < eagerPhotoCount ? "eager" : "lazy",
            fetchPriority: index < highPriorityPhotoCount ? "high" : "auto",
          }),
        }}
        onClick={({ index: clickedIndex }) => setIndex(clickedIndex)}
      />

      {revealOnScroll && visibleCount < photos.length ? (
        <div ref={revealTargetRef} className="flex h-24 items-end justify-center">
          <span className="editorial-kicker text-neutral-500">Loading more</span>
        </div>
      ) : null}

      <Lightbox
        className="editorial-lightbox"
        index={index}
        open={index >= 0}
        close={() => setIndex(-1)}
        slides={slides}
        plugins={plugins}
        carousel={{ imageFit: "contain" }}
        controller={{ closeOnBackdropClick: true }}
      />
    </>
  );
}
