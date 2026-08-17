"use client";

import dynamic from "next/dynamic";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import PhotoAlbum, { type Photo } from "react-photo-album";

import type { LightboxPhoto } from "./gallery-lightbox-overlay";
import { restoreLightboxOrigin } from "./lightbox-close";
import { ResponsiveGalleryImage } from "./responsive-gallery-image";
import { ClientPhotoActions } from "./client-photo-actions";

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

type ResponsiveAlbumPhoto = Photo & {
  smallSrc: string;
  mediumSrc?: string;
  smallWidth?: number;
  mediumWidth?: number;
  downloadHref?: string;
  downloadFilename?: string;
};

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
  const [originScrollY, setOriginScrollY] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const revealTargetRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const returnFocusEnabledRef = useRef(false);
  const returnScrollRef = useRef(0);
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

  useEffect(() => {
    if (index < 0 && returnFocusRef.current) {
      restoreLightboxOrigin(
        returnScrollRef.current,
        returnFocusRef.current,
        returnFocusEnabledRef.current,
      );
    }
  }, [index]);

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
  const photoAlbumItems: ResponsiveAlbumPhoto[] = useMemo(
    () =>
      visiblePhotos.map((photo) => ({
        key: photo.id,
        src: photo.smallSrc ?? photo.src,
        width: photo.width,
        height: photo.height,
        alt: photo.alt,
        smallSrc: photo.smallSrc ?? photo.src,
        mediumSrc: photo.mediumSrc,
        smallWidth: photo.smallWidth,
        mediumWidth: photo.mediumWidth,
        downloadHref: photo.downloadHref,
        downloadFilename: photo.downloadFilename,
      })),
    [visiblePhotos],
  );

  function openLightbox(clickedIndex: number, trigger: EventTarget | null, restoreFocus: boolean): void {
    const scrollY = window.scrollY;
    returnFocusRef.current = trigger instanceof HTMLElement ? trigger : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    returnFocusEnabledRef.current = restoreFocus;
    returnScrollRef.current = scrollY;
    setOriginScrollY(scrollY);
    setIndex(clickedIndex);
  }

  function closeLightbox(): void {
    setIndex(-1);
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
            photo: ({ onClick }, { width, height, index: photoIndex, photo }) => (
              <div
                key={photo.key ?? photo.src}
                className="react-photo-album--photo client-gallery-photo"
                style={{
                  "--react-photo-album--photo-width": width,
                  "--react-photo-album--photo-height": height,
                } as CSSProperties}
              >
                <button className="client-gallery-photo-open" type="button" onClick={onClick} aria-label={`Open ${photo.alt || "photo"} in gallery`}>
                  <ResponsiveGalleryImage
                smallSrc={photo.smallSrc ?? photo.src}
                mediumSrc={photo.mediumSrc}
                smallWidth={photo.smallWidth}
                mediumWidth={photo.mediumWidth}
                alt={photo.alt ?? ""}
                title={photo.title}
                width={Math.max(1, Math.round(width))}
                height={Math.max(1, Math.round(height))}
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                className="react-photo-album--image"
                loading={photoIndex === 0 ? "eager" : "lazy"}
                fetchPriority={photoIndex === 0 ? "high" : "auto"}
                decoding="async"
                unoptimized={disableOptimization}
              />
                </button>
                {photo.downloadHref ? <ClientPhotoActions compact downloadHref={photo.downloadHref} filename={photo.downloadFilename || photo.alt || "photo"} /> : null}
              </div>
            ),
          }}
          onClick={({ index: clickedIndex, event }) => openLightbox(clickedIndex, event.currentTarget, event.detail === 0)}
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
            {isLoadingMore ? "Loading…" : "Load More Photos"}
          </button>
          <p className="text-xs text-neutral-500" aria-live="polite">
            Showing {photos.length}{totalCount ? ` of ${totalCount}` : ""} photos
          </p>
          {loadError ? <p className="text-sm text-red-700" role="alert">{loadError}</p> : null}
        </div>
      ) : null}

      {index >= 0 ? (
        <GalleryLightboxOverlay
          photos={photos}
          index={index}
          originScrollY={originScrollY}
          onClose={closeLightbox}
        />
      ) : null}
    </>
  );
}
