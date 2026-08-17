"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { LightboxPhoto } from "./gallery-lightbox-overlay";
import { restoreLightboxOrigin } from "./lightbox-close";
import { ResponsiveGalleryImage } from "./responsive-gallery-image";

const GalleryLightboxOverlay = dynamic(
  () => import("./gallery-lightbox-overlay").then((module) => module.GalleryLightboxOverlay),
  { ssr: false },
);

type PublicGalleryMosaicProps = {
  photos: LightboxPhoto[];
  initialNextCursor?: string | null;
  loadMoreUrl?: string;
  totalCount?: number;
  desktopMode?: "continuous" | "hero";
};

type PagePayload = {
  photos?: LightboxPhoto[];
  nextCursor?: string | null;
};

function preloadLightbox(): void {
  void import("./gallery-lightbox-overlay");
}

export function PublicGalleryMosaic({
  photos: initialPhotos,
  initialNextCursor = null,
  loadMoreUrl,
  totalCount,
}: PublicGalleryMosaicProps) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [index, setIndex] = useState(-1);
  const [originScrollY, setOriginScrollY] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const returnScrollRef = useRef(0);

  useEffect(() => {
    if (index < 0 && returnFocusRef.current) {
      restoreLightboxOrigin(returnScrollRef.current, returnFocusRef.current);
    }
  }, [index]);

  function closeLightbox(): void {
    setIndex(-1);
  }

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
        return [...current, ...payload.photos!.filter((photo) => !knownIds.has(photo.id))];
      });
      setNextCursor(payload.nextCursor ?? null);
    } catch {
      setLoadError("Unable to load more photos. Please try again.");
    } finally {
      setIsLoadingMore(false);
    }
  }

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
        {photos.map((photo, photoIndex) => (
          <button
            key={photo.id}
            type="button"
            className="relative block aspect-[4/5] w-full overflow-hidden bg-neutral-100"
            style={{ contentVisibility: "auto", containIntrinsicSize: "320px 400px" }}
            onPointerEnter={preloadLightbox}
            onFocus={preloadLightbox}
            onClick={(event) => {
              const scrollY = window.scrollY;
              returnFocusRef.current = event.currentTarget;
              returnScrollRef.current = scrollY;
              setOriginScrollY(scrollY);
              setIndex(photoIndex);
            }}
            aria-label={`Open ${photo.alt} in gallery`}
          >
            <ResponsiveGalleryImage
              smallSrc={photo.smallSrc ?? photo.src}
              mediumSrc={photo.mediumSrc}
              smallWidth={photo.smallWidth}
              mediumWidth={photo.mediumWidth}
              alt={photo.alt}
              fill
              sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover"
              placeholder={photo.placeholderDataUrl ? "blur" : undefined}
              blurDataURL={photo.placeholderDataUrl}
              loading={photoIndex === 0 ? "eager" : "lazy"}
              fetchPriority={photoIndex === 0 ? "high" : "auto"}
            />
          </button>
        ))}
      </div>

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
