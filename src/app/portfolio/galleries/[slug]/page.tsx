import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicGalleryMosaic } from "@/components/public-gallery-mosaic";
import { PhotoResourceHints } from "@/components/photo-resource-hints";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/config/env";
import { headerCategoryLinks } from "@/lib/site-data";
import { getPublicGalleryBySlug } from "@/server/services/public-gallery";

type PublicGalleryPageProps = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 900;

export async function generateMetadata({ params }: PublicGalleryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const gallery = await getPublicGalleryBySlug(slug);

  if (!gallery) {
    return {
      title: "Gallery",
    };
  }

  return {
    title: gallery.title,
    description: gallery.description ?? `${gallery.categoryTitle} gallery by Alex Bereanu.`,
  };
}

export default async function PublicGalleryPage({ params }: PublicGalleryPageProps) {
  const { slug } = await params;
  const gallery = await getPublicGalleryBySlug(slug);

  if (!gallery) {
    notFound();
  }

  const missingPublicBase = !env.R2_PUBLIC_BASE_URL;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 py-8 sm:px-6 lg:px-8">
      <PhotoResourceHints publicImageOrigin={env.R2_PUBLIC_BASE_URL ? new URL(env.R2_PUBLIC_BASE_URL).origin : undefined} />
      <SiteHeader
        className="rounded p-4 backdrop-blur"
        links={[
          { href: "/", label: "Home" },
          ...headerCategoryLinks,
          { href: `/portfolio/${gallery.categorySlug}`, label: `Back to ${gallery.categoryTitle}` },
        ]}
      />

      <main className="flex flex-col gap-10">
        <section className="mx-auto w-full max-w-4xl space-y-3 text-center">
          <p className="editorial-kicker text-neutral-600">{gallery.categoryTitle}</p>
          <h1 className="editorial-heading text-5xl leading-tight">{gallery.title}</h1>
          {gallery.description ? <p className="text-sm text-neutral-700">{gallery.description}</p> : null}
        </section>

        {missingPublicBase ? (
          <p className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-[0_12px_30px_rgba(146,64,14,0.08)]">
            R2_PUBLIC_BASE_URL is not configured, so public gallery images cannot be rendered yet.
          </p>
        ) : null}

        <section aria-label={`${gallery.title} photos`}>
          <PublicGalleryMosaic
            photos={gallery.photos}
            initialNextCursor={gallery.nextCursor}
            loadMoreUrl={`/api/public-galleries/${encodeURIComponent(gallery.slug)}/assets`}
            totalCount={gallery.assetCount}
          />
        </section>
      </main>

      <SiteFooter
        links={[
          { href: "/", label: "Home" },
          { href: `/portfolio/${gallery.categorySlug}`, label: gallery.categoryTitle },
        ]}
      />
    </div>
  );
}
