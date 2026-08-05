import Link from "next/link";

import { env } from "@/config/env";
import { type PortfolioCategory } from "@/lib/site-data";
import { getPublicCategoryGalleriesBySlug, type GalleryPhoto } from "@/server/services/public-gallery";
import { createCsrfToken } from "@/server/security/request-protection";
import { getPortfolioContentKey, getPublicSiteChromeContent, getSiteContent } from "@/server/services/site-content";

import { BookingForm } from "./booking-form";
import { ContactForm } from "./contact-form";
import { PublicGalleryMosaic } from "./public-gallery-mosaic";
import { PhotoResourceHints } from "./photo-resource-hints";
import { ResponsiveGalleryImage } from "./responsive-gallery-image";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

type InquiryType = "booking" | "contact";

type CategoryLandingPageProps = {
  categorySlug: PortfolioCategory["slug"];
  title: string;
  eyebrow: string;
  description: string;
  inquiryType?: InquiryType;
  inquiryTitle?: string;
  inquiryDescription?: string;
  showcaseOnly?: boolean;
  showGalleriesAfterMosaic?: boolean;
};

type RepresentativePhoto = Pick<GalleryPhoto, "src" | "alt"> &
  Partial<Pick<GalleryPhoto, "smallSrc" | "mediumSrc" | "smallWidth" | "mediumWidth">> & { focalX?: number; focalY?: number };
type ImageLoading = "eager" | "lazy";
type FetchPriority = "high" | "low" | "auto";

function shuffledPhotos(photos: GalleryPhoto[]) {
  const nextPhotos = [...photos];

  for (let index = nextPhotos.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextPhotos[index], nextPhotos[swapIndex]] = [nextPhotos[swapIndex], nextPhotos[index]];
  }

  return nextPhotos;
}

function RepresentativeImage({
  photo,
  title,
  loading = "lazy",
  fetchPriority = "auto",
}: {
  photo?: RepresentativePhoto;
  title: string;
  loading?: ImageLoading;
  fetchPriority?: FetchPriority;
}) {
  if (!photo) {
    return (
      <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#f5f5f5,#d4d4d4)] text-xs uppercase tracking-wider text-neutral-600">
        No cover image
      </div>
    );
  }

  return (
    <ResponsiveGalleryImage
      smallSrc={photo.smallSrc ?? photo.src}
      mediumSrc={photo.mediumSrc}
      smallWidth={photo.smallWidth}
      mediumWidth={photo.mediumWidth}
      alt={photo.alt}
      fill
      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      className="object-cover"
      style={{ objectPosition: `${(photo.focalX ?? 0.5) * 100}% ${(photo.focalY ?? 0.5) * 100}%` }}
      title={title}
      loading={loading}
      fetchPriority={fetchPriority}
    />
  );
}

export async function CategoryLandingPage({
  categorySlug,
  title,
  eyebrow,
  description,
  inquiryType = "contact",
  inquiryTitle,
  inquiryDescription,
  showcaseOnly = false,
  showGalleriesAfterMosaic = false,
}: CategoryLandingPageProps) {
  const [{ galleries, showcasePhotos }, content, chrome] = await Promise.all([
    getPublicCategoryGalleriesBySlug(categorySlug),
    getSiteContent(getPortfolioContentKey(categorySlug)),
    getPublicSiteChromeContent(),
  ]);
  const heroPhoto = galleries.find((gallery) => gallery.photos.length > 0)?.photos[0];
  const featuredPhoto = content.imageSrc
    ? {
        src: content.imageSrc,
        alt: content.imageAlt ?? content.title,
        focalX: content.imageFocalX,
        focalY: content.imageFocalY,
      }
    : heroPhoto;
  const missingPublicBase = !env.R2_PUBLIC_BASE_URL;
  const csrfToken = createCsrfToken();
  const turnstileSiteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const inquirySectionId = inquiryType === "booking" ? "bookings" : "contact";
  const inquiryLabel = inquiryType === "booking" ? chrome.labels.booking : chrome.labels.connect;
  const inquiryCtaLabel = inquiryType === "booking" ? chrome.labels.booking : chrome.labels.connect;
  const resolvedTitle = content.title || title;
  const resolvedEyebrow = content.subtitle ?? eyebrow;
  const resolvedDescription = content.body || description;
  const resolvedInquiryTitle = content.ctaTitle ?? inquiryTitle ?? inquiryLabel;
  const resolvedInquiryDescription =
    content.ctaBody ??
    inquiryDescription ??
    (inquiryType === "booking"
      ? "Submissions are stored as actionable tickets in the admin panel and sent by email to your configured inbox."
      : "Send a note about the story, subject, location, or production needs you have in mind.");
  const shuffledShowcasePhotos = shuffledPhotos(showcasePhotos);

  if (showcaseOnly) {
    return (
      <div className="flex w-full flex-col bg-white">
        <PhotoResourceHints publicImageOrigin={env.R2_PUBLIC_BASE_URL ? new URL(env.R2_PUBLIC_BASE_URL).origin : undefined} />
        <SiteHeader
          brandName={chrome.brandName}
          className="mx-auto my-4 w-[calc(100%-2rem)] max-w-6xl rounded p-4 backdrop-blur"
          links={[
            { href: "/", label: chrome.labels.home },
            ...chrome.categoryLinks,
            ...(showGalleriesAfterMosaic ? [{ href: "#galleries", label: chrome.labels.galleries }] : []),
            { href: `#${inquirySectionId}`, label: inquiryLabel },
          ]}
        />

        <main className="flex w-full flex-col gap-20">
          {missingPublicBase ? (
            <p className="mx-auto w-[calc(100%-2rem)] max-w-6xl rounded bg-amber-50 px-4 py-3 text-sm text-amber-900">
              R2_PUBLIC_BASE_URL is not configured, so public portfolio images cannot be rendered yet.
            </p>
          ) : null}

          <section aria-label={`${resolvedTitle} photos`} className="w-full">
            <PublicGalleryMosaic photos={shuffledShowcasePhotos} desktopMode="hero" />
          </section>

          {showGalleriesAfterMosaic ? (
            <section id="galleries" className="mx-auto w-full max-w-6xl space-y-5 px-4 sm:px-6 lg:px-8">
              <h2 className="editorial-heading text-4xl">{chrome.labels.galleries}</h2>

              {galleries.length === 0 ? (
                <section className="rounded bg-neutral-50 p-8">
                  <p className="text-sm text-neutral-700">No public galleries published in this category yet.</p>
                </section>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {galleries.map((gallery) => {
                    const coverPhoto = gallery.photos[0];

                    return (
                      <Link
                        key={gallery.id}
                        href={`/portfolio/galleries/${gallery.slug}`}
                        className="editorial-card overflow-hidden rounded"
                      >
                        <div className="relative aspect-[4/3] bg-neutral-200">
                          <RepresentativeImage
                            photo={coverPhoto}
                            title={gallery.title}
                            loading="lazy"
                            fetchPriority="auto"
                          />
                        </div>
                        <div className="space-y-2 p-4">
                          <h3 className="editorial-heading text-2xl">{gallery.title}</h3>
                          {gallery.description ? <p className="whitespace-pre-wrap text-sm text-neutral-700">{gallery.description}</p> : null}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          <section id={inquirySectionId} className="mx-auto w-full max-w-6xl space-y-5 px-4 sm:px-6 lg:px-8">
            <h2 className="editorial-heading text-4xl">{resolvedInquiryTitle}</h2>
            <p className="whitespace-pre-wrap text-sm text-neutral-700">{resolvedInquiryDescription}</p>
            {inquiryType === "booking" ? (
              <BookingForm csrfToken={csrfToken} turnstileSiteKey={turnstileSiteKey} />
            ) : (
              <ContactForm csrfToken={csrfToken} turnstileSiteKey={turnstileSiteKey} />
            )}
          </section>
        </main>

        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <SiteFooter
            links={[
              { href: "/", label: chrome.labels.home },
              ...(showGalleriesAfterMosaic ? [{ href: "#galleries", label: chrome.labels.galleries }] : []),
              { href: `#${inquirySectionId}`, label: inquiryLabel },
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 py-8 sm:px-6 lg:px-8">
      <PhotoResourceHints publicImageOrigin={env.R2_PUBLIC_BASE_URL ? new URL(env.R2_PUBLIC_BASE_URL).origin : undefined} />
      <SiteHeader
        brandName={chrome.brandName}
        className="rounded p-4 backdrop-blur"
        links={[
          { href: "/", label: chrome.labels.home },
          ...chrome.categoryLinks,
          { href: "#galleries", label: chrome.labels.galleries },
          { href: `#${inquirySectionId}`, label: inquiryLabel },
        ]}
      />

      <main className="flex flex-col gap-20">
        <section id="hero" className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="editorial-kicker text-neutral-600">{resolvedEyebrow}</p>
            <h1 className="editorial-heading text-5xl leading-tight">{resolvedTitle}</h1>
            <p className="whitespace-pre-wrap text-sm text-neutral-700">{resolvedDescription}</p>
            <div className="flex flex-wrap gap-3">
              <a className="editorial-button rounded px-4 py-2" href="#galleries">
                View galleries
              </a>
              <a className="editorial-button editorial-button-secondary rounded px-4 py-2" href={`#${inquirySectionId}`}>
                {inquiryCtaLabel}
              </a>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded bg-neutral-200 shadow-[0_18px_50px_rgba(23,18,15,0.08)]">
            <RepresentativeImage photo={featuredPhoto} title={resolvedTitle} loading="eager" fetchPriority="high" />
          </div>
        </section>

        <section id="galleries" className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="editorial-heading text-4xl">{chrome.labels.galleries}</h2>
            </div>
            <Link className="header-link" href="/portfolio">
              {chrome.labels.portfolio}
            </Link>
          </div>

          {missingPublicBase ? (
            <p className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-[0_12px_30px_rgba(146,64,14,0.08)]">
              R2_PUBLIC_BASE_URL is not configured, so public portfolio images cannot be rendered yet.
            </p>
          ) : null}

          {galleries.length === 0 ? (
            <section className="rounded bg-neutral-50 p-8 shadow-[0_12px_30px_rgba(23,18,15,0.06)]">
              <p className="text-sm text-neutral-700">No public galleries published in this category yet.</p>
            </section>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {galleries.map((gallery) => {
                const coverPhoto = gallery.photos[0];

                return (
                  <Link
                    key={gallery.id}
                    href={`/portfolio/galleries/${gallery.slug}`}
                    className="editorial-card overflow-hidden rounded"
                  >
                    <div className="relative aspect-[4/3] bg-neutral-200">
                      <RepresentativeImage
                        photo={coverPhoto}
                        title={gallery.title}
                        loading="lazy"
                        fetchPriority="auto"
                      />
                    </div>
                    <div className="space-y-2 p-4">
                      <h3 className="editorial-heading text-2xl">{gallery.title}</h3>
                      {gallery.description ? <p className="whitespace-pre-wrap text-sm text-neutral-700">{gallery.description}</p> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section id={inquirySectionId} className="space-y-5">
          <h2 className="editorial-heading text-4xl">{resolvedInquiryTitle}</h2>
          <p className="whitespace-pre-wrap text-sm text-neutral-700">{resolvedInquiryDescription}</p>
          {inquiryType === "booking" ? (
            <BookingForm csrfToken={csrfToken} turnstileSiteKey={turnstileSiteKey} />
          ) : (
            <ContactForm csrfToken={csrfToken} turnstileSiteKey={turnstileSiteKey} />
          )}
        </section>
      </main>

      <SiteFooter
        links={[
          { href: "/", label: chrome.labels.home },
          { href: "#galleries", label: chrome.labels.galleries },
          { href: `#${inquirySectionId}`, label: inquiryLabel },
        ]}
      />
    </div>
  );
}
