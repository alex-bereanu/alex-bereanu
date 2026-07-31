import Image from "next/image";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PhotoResourceHints } from "@/components/photo-resource-hints";
import { env } from "@/config/env";
import { headerCategoryLinks, portfolioCategories } from "@/lib/site-data";
import { getPublicPortfolioCategorySummaries } from "@/server/services/public-gallery";
import { getSiteContent } from "@/server/services/site-content";

// Keep the route request-rendered so builds never depend on production database
// availability or migration state. Its underlying public data is still cached.
export const dynamic = "force-dynamic";

const IMAGE_QUALITY = 75;

export default async function PortfolioPage() {
  const [categories, content] = await Promise.all([
    getPublicPortfolioCategorySummaries(portfolioCategories),
    getSiteContent("portfolio.index"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <PhotoResourceHints publicImageOrigin={env.R2_PUBLIC_BASE_URL ? new URL(env.R2_PUBLIC_BASE_URL).origin : undefined} />
      <SiteHeader
        className="rounded p-4 backdrop-blur"
        links={[{ href: "/", label: "Home" }, ...headerCategoryLinks]}
      />

      <header className="space-y-2">
        <h1 className="editorial-heading text-5xl">{content.title}</h1>
        <p className="max-w-3xl text-sm text-neutral-700">{content.body}</p>
      </header>

      {!env.R2_PUBLIC_BASE_URL ? (
        <p className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-[0_12px_30px_rgba(146,64,14,0.08)]">
          Configure R2_PUBLIC_BASE_URL to render public category cover photos.
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category, categoryIndex) => (
          <Link
            key={category.categorySlug}
            className="editorial-card overflow-hidden rounded"
            href={`/portfolio/${category.categorySlug}`}
          >
            <div className="aspect-[4/3] bg-neutral-200">
              {category.coverPhoto ? (
                <Image
                  src={category.coverPhoto.src}
                  alt={category.coverPhoto.alt}
                  width={category.coverPhoto.smallWidth ?? category.coverPhoto.width}
                  height={category.coverPhoto.smallHeight ?? category.coverPhoto.height}
                  className="h-full w-full object-cover"
                  quality={IMAGE_QUALITY}
                  loading={categoryIndex === 0 ? "eager" : "lazy"}
                  fetchPriority={categoryIndex === 0 ? "high" : "auto"}
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#f5f5f5,#d4d4d4)] text-xs uppercase tracking-wider text-neutral-600">
                  No cover image
                </div>
              )}
            </div>

            <div className="space-y-2 p-4">
              <h2 className="editorial-heading text-2xl">{category.title}</h2>
              <p className="text-sm text-neutral-700">{category.description}</p>
            </div>
          </Link>
        ))}
      </section>

      <SiteFooter links={[{ href: "/", label: "Home" }]} />
    </main>
  );
}
