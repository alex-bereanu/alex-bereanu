import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/config/env";
import {
  buildWeddingMetadata,
  buildWeddingServiceJsonLd,
  resolveWeddingSeo,
  serializeJsonLd,
} from "@/lib/seo";
import {
  getPublishedSiteContentDocument,
  getPublicSiteChromeContent,
  getSiteContent,
} from "@/server/services/site-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [content, weddingPortfolio] = await Promise.all([
    getPublishedSiteContentDocument("weddings.landing"),
    getSiteContent("portfolio.weddings"),
  ]);
  return buildWeddingMetadata(
    resolveWeddingSeo({
      weddingsUrl: env.NEXT_PUBLIC_WEDDINGS_URL,
      seoTitle: content.values.seoTitle,
      seoDescription: content.values.seoDescription,
      imageUrl:
        weddingPortfolio.imageMediumSrc ?? weddingPortfolio.imageSrc,
      imageAlt: weddingPortfolio.imageAlt,
    }),
  );
}

export default async function WeddingsPage() {
  const [content, chrome, weddingPortfolio] = await Promise.all([
    getPublishedSiteContentDocument("weddings.landing"),
    getPublicSiteChromeContent(),
    getSiteContent("portfolio.weddings"),
  ]);
  const seo = resolveWeddingSeo({
    weddingsUrl: env.NEXT_PUBLIC_WEDDINGS_URL,
    seoTitle: content.values.seoTitle,
    seoDescription: content.values.seoDescription,
    imageUrl: weddingPortfolio.imageMediumSrc ?? weddingPortfolio.imageSrc,
    imageAlt: weddingPortfolio.imageAlt,
  });
  const jsonLd = buildWeddingServiceJsonLd({
    seo,
    brandName: chrome.brandName,
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
  });
  const mainSiteHref = (pathname: string) =>
    env.NEXT_PUBLIC_SITE_URL
      ? new URL(pathname, env.NEXT_PUBLIC_SITE_URL).toString()
      : pathname;
  const weddingPortfolioHref = mainSiteHref("/portfolio/weddings");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <SiteHeader
        brandName={chrome.brandName}
        className="rounded p-4 backdrop-blur"
        links={[
          { href: mainSiteHref("/"), label: chrome.labels.home },
          ...chrome.categoryLinks.map((link) => ({
            ...link,
            href: mainSiteHref(link.href),
          })),
          {
            href: weddingPortfolioHref,
            label: content.values.ctaTitle || "Wedding Portfolio",
          },
        ]}
      />
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">
          {content.values.subtitle}
        </p>
        <h1 className="editorial-heading text-5xl">{content.values.title}</h1>
        <p className="max-w-2xl whitespace-pre-wrap text-sm text-neutral-700">
          {content.values.body}
        </p>
      </header>
      <section className="rounded-lg bg-neutral-50 p-8 shadow-[0_12px_30px_rgba(23,18,15,0.06)]">
        <p className="whitespace-pre-wrap text-sm text-neutral-700">
          {content.values.ctaBody}
        </p>
        <Link
          className="editorial-button mt-5 inline-flex rounded px-4 py-2"
          href={weddingPortfolioHref}
        >
          {content.values.ctaTitle || "View Wedding Portfolio"}
        </Link>
      </section>
      <SiteFooter
        links={[
          {
            href: weddingPortfolioHref,
            label:
              chrome.categoryLinks.find((link) =>
                link.href.endsWith("/weddings"),
              )?.label || "Weddings",
          },
        ]}
      />
    </main>
  );
}
