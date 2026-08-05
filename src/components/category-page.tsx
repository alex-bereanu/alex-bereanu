import Link from "next/link";
import type { ReactNode } from "react";

import { env } from "@/config/env";
import { type PortfolioCategory } from "@/lib/site-data";
import { getPublicCategoryGalleriesBySlug } from "@/server/services/public-gallery";

import { GalleryLightbox } from "./gallery-lightbox";

type CategoryPageProps = {
  categorySlug: PortfolioCategory["slug"];
  title: string;
  description: string;
  backHref?: string;
  footerSlot?: ReactNode;
};

export async function CategoryPage({
  categorySlug,
  title,
  description,
  backHref = "/portfolio",
  footerSlot,
}: CategoryPageProps) {
  const { galleries } = await getPublicCategoryGalleriesBySlug(categorySlug);
  const missingPublicBase = !env.R2_PUBLIC_BASE_URL;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <nav>
        <Link className="text-sm font-medium underline" href={backHref}>
          Back
        </Link>
      </nav>

      <header className="space-y-2">
        <h1 className="editorial-heading text-5xl">{title}</h1>
        <p className="max-w-3xl text-sm text-neutral-700">{description}</p>
      </header>

      {missingPublicBase ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          R2_PUBLIC_BASE_URL is not configured, so public portfolio images cannot be rendered yet.
        </p>
      ) : null}

      {galleries.length === 0 ? (
        <section className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-8">
          <p className="text-sm text-neutral-700">No public galleries published in this category yet.</p>
        </section>
      ) : (
        <section className="space-y-8">
          {galleries.map((gallery) => (
            <article key={gallery.id} className="space-y-3 rounded border bg-white p-4 sm:p-5">
              <header className="space-y-1">
                <h2 className="editorial-heading text-2xl">{gallery.title}</h2>
                {gallery.description ? <p className="whitespace-pre-wrap text-sm text-neutral-700">{gallery.description}</p> : null}
              </header>

              {missingPublicBase ? (
                <p className="rounded border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                  Preview unavailable until R2 public base URL is configured.
                </p>
              ) : (
                <GalleryLightbox photos={gallery.photos} />
              )}
            </article>
          ))}
        </section>
      )}

      {footerSlot ? <section>{footerSlot}</section> : null}
    </main>
  );
}
