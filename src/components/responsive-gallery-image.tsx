import Image, { type ImageProps } from "next/image";

type ResponsiveGalleryImageProps = Omit<ImageProps, "quality" | "sizes" | "src"> & {
  smallSrc: string;
  mediumSrc?: string;
  smallWidth?: number;
  mediumWidth?: number;
  sizes: string;
};

function positiveWidth(width: number | undefined, fallback: number): number {
  return Number.isFinite(width) && width && width > 0 ? Math.round(width) : fallback;
}

/**
 * Next's runtime optimizer is intentionally disabled for this project. The
 * native picture source gives browsers a real srcset backed by our verified R2
 * derivatives instead of stretching the smallest derivative across dense grids.
 */
export function ResponsiveGalleryImage({
  smallSrc,
  mediumSrc,
  smallWidth,
  mediumWidth,
  sizes,
  alt,
  ...imageProps
}: ResponsiveGalleryImageProps) {
  const resolvedSmallWidth = positiveWidth(smallWidth, 800);
  const resolvedMediumWidth = positiveWidth(mediumWidth, 1440);
  const hasDistinctMedium = Boolean(mediumSrc && mediumSrc !== smallSrc && resolvedMediumWidth > resolvedSmallWidth);
  const srcSet = hasDistinctMedium
    ? `${smallSrc} ${resolvedSmallWidth}w, ${mediumSrc} ${resolvedMediumWidth}w`
    : `${smallSrc} ${resolvedSmallWidth}w`;

  return (
    <picture style={{ display: "contents", position: "relative" }}>
      <source type="image/webp" srcSet={srcSet} sizes={sizes} />
      <Image {...imageProps} src={smallSrc} alt={alt} sizes={sizes} unoptimized />
    </picture>
  );
}
