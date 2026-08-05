import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { cache } from "react";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  getSiteContentDefinition,
  mergeSiteContentPayload,
  siteContentRegistry,
  type SiteContentDocumentKey,
} from "@/lib/site-content-registry";
import { portfolioCategories, type PortfolioCategory } from "@/lib/site-data";
import { isAdminContentPhase3Enabled } from "@/server/services/admin-content-phase3";
import { SITE_CONTENT_CACHE_TAG, siteContentCacheTag } from "@/server/services/public-cache";

export type SiteContentKey =
  | "home.about"
  | "home.contact"
  | "social.instagram"
  | "portfolio.index"
  | `portfolio.${PortfolioCategory["slug"]}`;

export type SiteContentDefaults = {
  key: SiteContentKey;
  adminLabel: string;
  adminDescription: string;
  title: string;
  subtitle?: string;
  body: string;
  ctaTitle?: string;
  ctaBody?: string;
  imageAlt?: string;
  supportsCta?: boolean;
  supportsImage?: boolean;
  isSocialUrl?: boolean;
};

export type ResolvedSiteContent = SiteContentDefaults & {
  imageObjectKey?: string;
  imageSmallObjectKey?: string;
  imageMediumObjectKey?: string;
  imageSrc?: string;
  imageSmallSrc?: string;
  imageMediumSrc?: string;
  imageFocalX?: number;
  imageFocalY?: number;
  seoTitle?: string;
  seoDescription?: string;
};

export type PublishedSiteContentDocument = {
  key: SiteContentDocumentKey;
  definition: ReturnType<typeof getSiteContentDefinition>;
  values: Record<string, string>;
  imageObjectKey?: string;
  imageSmallObjectKey?: string;
  imageMediumObjectKey?: string;
  imageSrc?: string;
  imageSmallSrc?: string;
  imageMediumSrc?: string;
  imageAlt?: string;
  imageFocalX?: number;
  imageFocalY?: number;
  publishedRevisionId?: string;
  publishedAt?: string;
};

export const siteContentDefaults: SiteContentDefaults[] = [
  {
    key: "home.about", adminLabel: "Main page - About Me", adminDescription: "Controls the About Me block below the homepage mosaic.",
    title: "About Me", body: "I help clients preserve moments and present brands with sharp visual storytelling, calm communication, and detail-focused post-processing.",
    imageAlt: "About Alex Bereanu", supportsImage: true,
  },
  {
    key: "home.contact", adminLabel: "Main page - Connect", adminDescription: "Controls the Connect section below the homepage About block.",
    title: "Connect", body: "",
  },
  {
    key: "social.instagram", adminLabel: "Social - Instagram", adminDescription: "Controls the centered Instagram icon button in the website footer.",
    title: "Instagram", body: "", isSocialUrl: true,
  },
  {
    key: "portfolio.index", adminLabel: "Portfolio overview", adminDescription: "Controls the title and intro paragraph on the /portfolio page.",
    title: "Portfolio", body: "Curated galleries by category. Open any category for a responsive grid and lightbox preview.",
  },
  {
    key: "portfolio.weddings", adminLabel: "Portfolio - Weddings", adminDescription: "Controls the wedding portfolio hero, inquiry copy, and optional hero photo.",
    title: "Weddings by Alex Bereanu", subtitle: "Wedding Photography", body: "Wedding stories crafted around authentic emotion, documentary rhythm, and elegant portraits.",
    ctaTitle: "Book a wedding date", ctaBody: "Share the date, location, guest count, and the atmosphere you want preserved. The request lands in the same booking workflow used from the main page.",
    imageAlt: "Wedding portfolio feature image", supportsCta: true, supportsImage: true,
  },
  {
    key: "portfolio.portraits", adminLabel: "Portfolio - Portraits", adminDescription: "Controls the portrait portfolio hero, inquiry copy, and optional hero photo.",
    title: "Portraits by Alex Bereanu", subtitle: "Portrait Photography", body: "Portrait sessions and editorial stories with controlled lighting, natural direction, and careful retouching.",
    ctaBody: "Tell me who the portraits are for, the look you want, and whether you need studio, outdoor, or on-location coverage.",
    imageAlt: "Portrait portfolio feature image", supportsCta: true, supportsImage: true,
  },
  {
    key: "portfolio.automotive", adminLabel: "Portfolio - Automotive", adminDescription: "Controls the automotive portfolio hero, inquiry copy, and optional hero photo.",
    title: "Automotive by Alex Bereanu", subtitle: "Automotive Photography", body: "Automotive projects for brands, collectors, and dealerships with dramatic compositions and precise detail work.",
    ctaBody: "Share the vehicle, location, intended use, and any brand or campaign direction so we can shape the shoot around it.",
    imageAlt: "Automotive portfolio feature image", supportsCta: true, supportsImage: true,
  },
  {
    key: "portfolio.landscapes", adminLabel: "Portfolio - Places", adminDescription: "Controls the places portfolio hero, inquiry copy, and optional hero photo.",
    title: "Places by Alex Bereanu", subtitle: "Places Photography", body: "Travel, architecture, nature, and destination photography captured across memorable environments with print-ready finishing.",
    ctaBody: "Ask about prints, licensing, location-based commissions, or visual sets for editorial and interior projects.",
    imageAlt: "Places portfolio feature image", supportsCta: true, supportsImage: true,
  },
];

const defaultsByKey = Object.fromEntries(siteContentDefaults.map((content) => [content.key, content])) as Record<SiteContentKey, SiteContentDefaults>;

type ContentRow = {
  key: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  ctaTitle: string | null;
  ctaBody: string | null;
  imageObjectKey: string | null;
  imageSmallObjectKey: string | null;
  imageMediumObjectKey: string | null;
  imageAlt: string | null;
  imageFocalX?: number | null;
  imageFocalY?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  publishedPayload?: unknown;
  publishedRevisionId?: string | null;
  publishedAt?: Date | null;
};

function buildPublicContentImageUrl(objectKey: string | null | undefined): string | undefined {
  if (!objectKey || !env.R2_PUBLIC_BASE_URL) return undefined;
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${objectKey}`;
}

async function readContentRow(key: string): Promise<ContentRow | null> {
  if (isAdminContentPhase3Enabled()) {
    return prisma.siteContent.findUnique({
      where: { key },
      select: {
        key: true, title: true, subtitle: true, body: true, ctaTitle: true, ctaBody: true,
        imageObjectKey: true, imageSmallObjectKey: true, imageMediumObjectKey: true, imageAlt: true,
        imageFocalX: true, imageFocalY: true, seoTitle: true, seoDescription: true,
        publishedPayload: true, publishedRevisionId: true, publishedAt: true,
      },
    });
  }

  return prisma.siteContent.findUnique({
    where: { key },
    select: {
      key: true, title: true, subtitle: true, body: true, ctaTitle: true, ctaBody: true,
      imageObjectKey: true, imageSmallObjectKey: true, imageMediumObjectKey: true, imageAlt: true,
    },
  });
}

const cachedRowReaders = new Map<string, () => Promise<ContentRow | null>>();

function getCachedRowReader(key: string): () => Promise<ContentRow | null> {
  const current = cachedRowReaders.get(key);
  if (current) return current;
  const reader = unstable_cache(() => readContentRow(key), ["site-content-row-v3", key], { revalidate: 3600, tags: [SITE_CONTENT_CACHE_TAG, siteContentCacheTag(key)] });
  cachedRowReaders.set(key, reader);
  return reader;
}

async function getCachedSiteContentRows(keys: string[]): Promise<ContentRow[]> {
  const rows = await Promise.all(keys.map((key) => getCachedRowReader(key)()));
  return rows.filter((row): row is ContentRow => Boolean(row));
}

function explicitPayload(row: ContentRow | undefined): Record<string, string> {
  if (!row) return {};
  return Object.fromEntries(Object.entries({
    title: row.title, subtitle: row.subtitle, body: row.body, ctaTitle: row.ctaTitle, ctaBody: row.ctaBody,
    imageAlt: row.imageAlt, seoTitle: row.seoTitle, seoDescription: row.seoDescription,
  }).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
}

export async function getPublishedSiteContentDocuments(keys: SiteContentDocumentKey[]): Promise<PublishedSiteContentDocument[]> {
  const uniqueKeys = [...new Set(keys)];
  const rows = env.DATABASE_URL ? await getCachedSiteContentRows(uniqueKeys) : [];
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));

  return uniqueKeys.map((key) => {
    const row = rowsByKey.get(key);
    const payload = isAdminContentPhase3Enabled() && row?.publishedPayload ? row.publishedPayload : explicitPayload(row);
    const imageSmallSrc = buildPublicContentImageUrl(row?.imageSmallObjectKey);
    const imageMediumSrc = buildPublicContentImageUrl(row?.imageMediumObjectKey);
    const imageOriginalSrc = buildPublicContentImageUrl(row?.imageObjectKey);
    return {
      key,
      definition: getSiteContentDefinition(key),
      values: mergeSiteContentPayload(key, payload),
      imageObjectKey: row?.imageObjectKey ?? undefined,
      imageSmallObjectKey: row?.imageSmallObjectKey ?? undefined,
      imageMediumObjectKey: row?.imageMediumObjectKey ?? undefined,
      imageSrc: imageMediumSrc ?? imageOriginalSrc,
      imageSmallSrc,
      imageMediumSrc,
      imageAlt: row?.imageAlt ?? undefined,
      imageFocalX: row?.imageFocalX ?? undefined,
      imageFocalY: row?.imageFocalY ?? undefined,
      publishedRevisionId: row?.publishedRevisionId ?? undefined,
      publishedAt: row?.publishedAt?.toISOString(),
    };
  });
}

export const getPublishedSiteContentDocument = cache(async (key: SiteContentDocumentKey): Promise<PublishedSiteContentDocument> => {
  const [document] = await getPublishedSiteContentDocuments([key]);
  if (!document) throw new Error("Site content definition is unavailable.");
  return document;
});

function mergeLegacyContent(defaults: SiteContentDefaults, document: PublishedSiteContentDocument): ResolvedSiteContent {
  const values = document.values;
  return {
    ...defaults,
    title: values.title ?? defaults.title,
    subtitle: values.subtitle ?? defaults.subtitle,
    body: values.body ?? defaults.body,
    ctaTitle: values.ctaTitle ?? defaults.ctaTitle,
    ctaBody: values.ctaBody ?? defaults.ctaBody,
    imageAlt: document.imageAlt ?? defaults.imageAlt,
    imageObjectKey: document.imageObjectKey,
    imageSmallObjectKey: document.imageSmallObjectKey,
    imageMediumObjectKey: document.imageMediumObjectKey,
    imageSrc: document.imageSrc,
    imageSmallSrc: document.imageSmallSrc,
    imageMediumSrc: document.imageMediumSrc,
    imageFocalX: document.imageFocalX,
    imageFocalY: document.imageFocalY,
    seoTitle: values.seoTitle || undefined,
    seoDescription: values.seoDescription || undefined,
  };
}

export function getSiteContentDefaults(key: SiteContentKey): SiteContentDefaults {
  return defaultsByKey[key];
}

export async function getSiteContents(keys: SiteContentKey[]): Promise<ResolvedSiteContent[]> {
  const documents = await getPublishedSiteContentDocuments([...new Set(keys)]);
  const documentsByKey = new Map(documents.map((document) => [document.key, document]));
  return [...new Set(keys)].map((key) => mergeLegacyContent(getSiteContentDefaults(key), documentsByKey.get(key)!));
}

export const getSiteContent = cache(async (key: SiteContentKey): Promise<ResolvedSiteContent> => {
  const [content] = await getSiteContents([key]);
  return content!;
});

export function buildSiteContentMetadata(content: ResolvedSiteContent, canonicalPath: string): Metadata {
  const title = content.seoTitle || content.title;
  const description = content.seoDescription || content.body;
  const canonical = env.NEXT_PUBLIC_SITE_URL ? new URL(canonicalPath, env.NEXT_PUBLIC_SITE_URL).toString() : canonicalPath;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      images: content.imageMediumSrc || content.imageSrc ? [{ url: content.imageMediumSrc ?? content.imageSrc!, alt: content.imageAlt ?? title }] : undefined,
    },
  };
}

export async function getEditableSiteContentEntries(): Promise<ResolvedSiteContent[]> {
  if (!env.DATABASE_URL) return siteContentDefaults.map((defaults) => mergeLegacyContent(defaults, {
    key: defaults.key, definition: getSiteContentDefinition(defaults.key), values: mergeSiteContentPayload(defaults.key),
  }));

  const rows = await prisma.siteContent.findMany({
    where: { key: { in: siteContentDefaults.map((content) => content.key) } },
    select: {
      key: true, title: true, subtitle: true, body: true, ctaTitle: true, ctaBody: true,
      imageObjectKey: true, imageSmallObjectKey: true, imageMediumObjectKey: true, imageAlt: true,
    },
  });
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  return siteContentDefaults.map((defaults) => {
    const row = rowsByKey.get(defaults.key);
    const imageSmallSrc = buildPublicContentImageUrl(row?.imageSmallObjectKey);
    const imageMediumSrc = buildPublicContentImageUrl(row?.imageMediumObjectKey);
    const imageOriginalSrc = buildPublicContentImageUrl(row?.imageObjectKey);
    return {
      ...defaults,
      title: row?.title?.trim() || defaults.title,
      subtitle: row?.subtitle?.trim() || defaults.subtitle,
      body: row?.body?.trim() || defaults.body,
      ctaTitle: row?.ctaTitle?.trim() || defaults.ctaTitle,
      ctaBody: row?.ctaBody?.trim() || defaults.ctaBody,
      imageAlt: row?.imageAlt?.trim() || defaults.imageAlt,
      imageObjectKey: row?.imageObjectKey ?? undefined,
      imageSmallObjectKey: row?.imageSmallObjectKey ?? undefined,
      imageMediumObjectKey: row?.imageMediumObjectKey ?? undefined,
      imageSrc: imageMediumSrc ?? imageOriginalSrc,
      imageSmallSrc, imageMediumSrc,
    };
  });
}

export function getPortfolioContentKey(slug: PortfolioCategory["slug"]): SiteContentKey {
  return `portfolio.${slug}`;
}

export function getEditablePortfolioCategories(): PortfolioCategory[] {
  return portfolioCategories;
}

export const getPublicSiteChromeContent = cache(async () => {
  const [brand, navigation, footer] = await getPublishedSiteContentDocuments(["global.brand", "global.navigation", "global.footer"]);
  const labels = navigation?.values ?? {};
  return {
    brandName: brand?.values.title || "Alex Bereanu",
    tagline: footer?.values.subtitle || brand?.values.subtitle || "The elegance of being there",
    labels: {
      home: labels.homeLabel || "Home",
      portfolio: labels.portfolioLabel || "Portfolio",
      about: labels.aboutLabel || "About",
      connect: labels.connectLabel || "Connect",
      galleries: labels.galleriesLabel || "Galleries",
      booking: labels.bookingLabel || "Bookings",
    },
    categoryLinks: portfolioCategories.map((category) => ({
      href: `/portfolio/${category.slug}`,
      label: labels[`${category.slug}Label`] || category.title,
    })),
  };
});

export const editableSiteContentDefinitions = siteContentRegistry;
