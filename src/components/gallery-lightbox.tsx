"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import PhotoAlbum, { type Photo } from "react-photo-album";

import type { LightboxPhoto } from "./gallery-lightbox-overlay";

const GalleryLightboxOverlay = dynamic(
  () => import("./gallery-lightbox-overlay").then((module) => module.GalleryLightboxOverlay),
  { ssr: false },
);

type PhotoGalleryItem = LightboxPhoto & {
  placeholderDataUrl?: string;
};

type GalleryLightboxProps = {
  photos: PhotoGalleryItem[];
  batchSize?: number;
  initialCount?: number;
  revealOnScroll?: boolean;
  spacing?: number;
  targetRowHeight?: number;
  disableOptimization?: boolean;
  initialNextCursor?: string | null;
  loadMoreUrl?: string;
  downloadBasePath?: string;
  totalCount?: number;
};

type PagePayload = {
  photos?: PhotoGalleryItem[];
  nextCursor?: string | null;
};

const IMAGE_QUALITY = 75;

function preloadLightbox(): void {
  void import("./gallery-lightbox-overlay");
}

export function GalleryLightbox({
  photos: initialPhotos,
  batchSize = 12,
  initialCount,
  revealOnScroll = false,
  spacing = 10,
  targetRowHeight = 240,
  disableOptimization = false,
  initialNextCursor = null,
  loadMoreUrl,
  downloadBasePath,
  totalCount,
}: GalleryLightboxProps) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [index, setIndex] = useState(-1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const revealTargetRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const resolvedInitialCount = initialCount ?? photos.length;
  const [visibleCount, setVisibleCount] = useState(() =>
    revealOnScroll ? Math.min(resolvedInitialCount, photos.length) : photos.length,
  );

  useEffect(() => {
    if (!revealOnScroll || visibleCount >= photos.length) return;
    const target = revealTargetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisibleCount((count) => Math.min(count + batchSize, photos.length));
        }
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [batchSize, photos.length, revealOnScroll, visibleCount]);

  async function loadMore(): Promise<void> {
    if (!loadMoreUrl || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const separator = loadMoreUrl.includes("?") ? "&" : "?";
      const response = await fetch(`${loadMoreUrl}${separator}cursor=${encodeURIComponent(nextCursor)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as PagePayload;
      if (!response.ok || !Array.isArray(payload.photos)) throw new Error("invalid_gallery_page");

      setPhotos((current) => {
        const knownIds = new Set(current.map((photo) => photo.id));
        const additions = payload.photos!
          .filter((photo) => !knownIds.has(photo.id))
          .map((photo) => ({
            ...photo,
            downloadHref: downloadBasePath ? `${downloadBasePath}/${photo.id}/download` : photo.downloadHref,
          }));
        return [...current, ...additions];
      });
      setVisibleCount((count) => (revealOnScroll ? count : count + payload.photos!.length));
      setNextCursor(payload.nextCursor ?? null);
    } catch {
      setLoadError("Unable to load more photos. Please try again.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  const visiblePhotos = revealOnScroll ? photos.slice(0, visibleCount) : photos;
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

  function openLightbox(clickedIndex: number, trigger: EventTarget | null): void {
    returnFocusRef.current = trigger instanceof HTMLElement ? trigger : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIndex(clickedIndex);
  }

  function closeLightbox(): void {
    setIndex(-1);
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  if (photoAlbumItems.length === 0) {
    return (
      <section className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-8">
        <p className="text-sm text-neutral-700">No photos published in this section yet.</p>
      </section>
    );
  }

  return (
    <>
      <div onPointerEnter={preloadLightbox} onFocus={preloadLightbox}>
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
                unoptimized={disableOptimization}
              />
            ),
          }}
          componentsProps={{
            image: ({ index: photoIndex }) => ({
              loading: photoIndex === 0 ? "eager" : "lazy",
              fetchPriority: photoIndex === 0 ? "high" : "auto",
            }),
          }}
          onClick={({ index: clickedIndex, event }) => openLightbox(clickedIndex, event.currentTarget)}
        />
      </div>

      {revealOnScroll && visibleCount < photos.length ? (
        <div ref={revealTargetRef} className="flex h-24 items-end justify-center">
          <span className="editorial-kicker text-neutral-500">Loading more</span>
        </div>
      ) : null}

      {nextCursor && loadMoreUrl ? (
        <div className="flex flex-col items-center gap-2 pt-6">
          <button
            className="editorial-button rounded px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading..." : "Load more photos"}
          </button>
          <p className="text-xs text-neutral-500" aria-live="polite">
            Showing {photos.length}{totalCount ? ` of ${totalCount}` : ""} photos
          </p>
          {loadError ? <p className="text-sm text-red-700">{loadError}</p> : null}
        </div>
      ) : null}

      {index >= 0 ? (
        <GalleryLightboxOverlay photos={photos} index={index} onClose={closeLightbox} />
      ) : null}
    </>
  );
}
