"use client";

import Lightbox from "yet-another-react-lightbox";
import Download from "yet-another-react-lightbox/plugins/download";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

import { useMobileImageVariant } from "./use-mobile-image-variant";
import { useReducedMotion } from "./use-reduced-motion";

export type LightboxPhoto = {
  id: string;
  src: string;
  smallSrc?: string;
  mediumSrc?: string;
  largeSrc?: string;
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

export function GalleryLightboxOverlay({
  photos,
  index,
  onClose,
}: {
  photos: LightboxPhoto[];
  index: number;
  onClose: () => void;
}) {
  const isMobile = useMobileImageVariant();
  const reducedMotion = useReducedMotion();
  const hasDownloads = photos.some((photo) => photo.downloadHref);
  const plugins = isMobile
    ? hasDownloads ? [Zoom, Download] : [Zoom]
    : hasDownloads ? [Zoom, Thumbnails, Download] : [Zoom, Thumbnails];
  const slides = photos.map((photo) => ({
    src: isMobile
      ? photo.mediumSrc ?? photo.smallSrc ?? photo.src
      : photo.largeSrc ?? photo.mediumSrc ?? photo.src,
    width: isMobile
      ? photo.mediumWidth ?? photo.width
      : photo.largeWidth ?? photo.mediumWidth ?? photo.width,
    height: isMobile
      ? photo.mediumHeight ?? photo.height
      : photo.largeHeight ?? photo.mediumHeight ?? photo.height,
    alt: photo.alt,
    thumbnail: photo.smallSrc ?? photo.src,
    download: photo.downloadHref ? { url: photo.downloadHref, filename: photo.alt } : undefined,
  }));

  return (
    <Lightbox
      className="editorial-lightbox"
      index={index}
      open
      close={onClose}
      slides={slides}
      plugins={plugins}
      thumbnails={{ showToggle: false, hidden: isMobile }}
      animation={reducedMotion ? { fade: 0, swipe: 0, navigation: 0 } : undefined}
      carousel={{ imageFit: "contain", preload: isMobile ? 1 : 2 }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: isMobile, closeOnPullUp: isMobile }}
    />
  );
}
