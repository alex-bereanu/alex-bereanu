import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { portfolioCategories, type PortfolioCategory } from "@/lib/site-data";

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
};

export const siteContentDefaults: SiteContentDefaults[] = [
  {
    key: "home.about",
    adminLabel: "Main page - About Me",
    adminDescription: "Controls the About Me block below the homepage mosaic.",
    title: "About Me",
    body:
      "I help clients preserve moments and present brands with sharp visual storytelling, calm communication, and detail-focused post-processing.",
    imageAlt: "About Alex Bereanu",
    supportsImage: true,
  },
  {
    key: "home.contact",
    adminLabel: "Main page - Connect",
    adminDescription: "Controls the Connect section below the homepage About block.",
    title: "Connect",
    body: "",
  },
  {
    key: "social.instagram",
    adminLabel: "Social - Instagram",
    adminDescription: "Controls the centered Instagram icon button in the website footer.",
    title: "Instagram",
    body: "",
    isSocialUrl: true,
  },
  {
    key: "portfolio.index",
    adminLabel: "Portfolio overview",
    adminDescription: "Controls the title and intro paragraph on the /portfolio page.",
    title: "Portfolio",
    body: "Curated galleries by category. Open any category for a responsive grid and lightbox preview.",
  },
  {
    key: "portfolio.weddings",
    adminLabel: "Portfolio - Weddings",
    adminDescription: "Controls the wedding portfolio hero, inquiry copy, and optional hero photo.",
    title: "Weddings by Alex Bereanu",
    subtitle: "Wedding Photography",
    body: "Wedding stories crafted around authentic emotion, documentary rhythm, and elegant portraits.",
    ctaTitle: "Book a wedding date",
    ctaBody:
      "Share the date, location, guest count, and the atmosphere you want preserved. The request lands in the same booking workflow used from the main page.",
    imageAlt: "Wedding portfolio feature image",
    supportsCta: true,
    supportsImage: true,
  },
  {
    key: "portfolio.portraits",
    adminLabel: "Portfolio - Portraits",
    adminDescription: "Controls the portrait portfolio hero, inquiry copy, and optional hero photo.",
    title: "Portraits by Alex Bereanu",
    subtitle: "Portrait Photography",
    body: "Portrait sessions and editorial stories with controlled lighting, natural direction, and careful retouching.",
    ctaBody:
      "Tell me who the portraits are for, the look you want, and whether you need studio, outdoor, or on-location coverage.",
    imageAlt: "Portrait portfolio feature image",
    supportsCta: true,
    supportsImage: true,
  },
  {
    key: "portfolio.automotive",
    adminLabel: "Portfolio - Automotive",
    adminDescription: "Controls the automotive portfolio hero, inquiry copy, and optional hero photo.",
    title: "Automotive by Alex Bereanu",
    subtitle: "Automotive Photography",
    body: "Automotive projects for brands, collectors, and dealerships with dramatic compositions and precise detail work.",
    ctaBody:
      "Share the vehicle, location, intended use, and any brand or campaign direction so we can shape the shoot around it.",
    imageAlt: "Automotive portfolio feature image",
    supportsCta: true,
    supportsImage: true,
  },
  {
    key: "portfolio.landscapes",
    adminLabel: "Portfolio - Places",
    adminDescription: "Controls the places portfolio hero, inquiry copy, and optional hero photo.",
    title: "Places by Alex Bereanu",
    subtitle: "Places Photography",
    body:
      "Travel, architecture, nature, and destination photography captured across memorable environments with print-ready finishing.",
    ctaBody: "Ask about prints, licensing, location-based commissions, or visual sets for editorial and interior projects.",
    imageAlt: "Places portfolio feature image",
    supportsCta: true,
    supportsImage: true,
  },
  {
    key: "portfolio.product",
    adminLabel: "Portfolio - Product",
    adminDescription: "Controls the product portfolio hero, inquiry copy, and optional hero photo.",
    title: "Product by Alex Bereanu",
    subtitle: "Product Photography",
    body: "Commercial product visuals for ecommerce catalogs, launch campaigns, and ad creative with controlled lighting.",
    ctaBody:
      "Send the product type, quantity, usage needs, and deadline so I can recommend a clean production plan.",
    imageAlt: "Product portfolio feature image",
    supportsCta: true,
    supportsImage: true,
  },
  {
    key: "portfolio.corporate",
    adminLabel: "Portfolio - Corporate",
    adminDescription: "Controls the corporate portfolio hero, inquiry copy, and optional hero photo.",
    title: "Corporate by Alex Bereanu",
    subtitle: "Corporate Photography",
    body:
      "Corporate portraits, team sessions, and event coverage shaped around brand guidelines and practical delivery needs.",
    ctaBody:
      "Share the team size, location, schedule, and how the images will be used so the coverage can stay efficient.",
    imageAlt: "Corporate portfolio feature image",
    supportsCta: true,
    supportsImage: true,
  },
];

const defaultsByKey = Object.fromEntries(siteContentDefaults.map((content) => [content.key, content])) as Record<
  SiteContentKey,
  SiteContentDefaults
>;

function buildPublicContentImageUrl(objectKey: string | null | undefined): string | undefined {
  if (!objectKey || !env.R2_PUBLIC_BASE_URL) {
    return undefined;
  }

  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${objectKey}`;
}

function mergeContent(defaults: SiteContentDefaults, row?: {
  title: string | null;
  subtitle: string | null;
  body: string | null;
  ctaTitle: string | null;
  ctaBody: string | null;
  imageObjectKey: string | null;
  imageSmallObjectKey: string | null;
  imageMediumObjectKey: string | null;
  imageAlt: string | null;
}): ResolvedSiteContent {
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
    imageSmallSrc,
    imageMediumSrc,
  };
}

export function getSiteContentDefaults(key: SiteContentKey): SiteContentDefaults {
  return defaultsByKey[key];
}

export async function getSiteContent(key: SiteContentKey): Promise<ResolvedSiteContent> {
  const defaults = getSiteContentDefaults(key);

  if (!env.DATABASE_URL) {
    return mergeContent(defaults);
  }

  const row = await prisma.siteContent.findUnique({ where: { key } });
  return mergeContent(defaults, row ?? undefined);
}

export async function getEditableSiteContentEntries(): Promise<ResolvedSiteContent[]> {
  if (!env.DATABASE_URL) {
    return siteContentDefaults.map((defaults) => mergeContent(defaults));
  }

  const rows = await prisma.siteContent.findMany({
    where: {
      key: {
        in: siteContentDefaults.map((content) => content.key),
      },
    },
  });
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));

  return siteContentDefaults.map((defaults) => mergeContent(defaults, rowsByKey.get(defaults.key)));
}

export function getPortfolioContentKey(slug: PortfolioCategory["slug"]): SiteContentKey {
  return `portfolio.${slug}`;
}

export function getEditablePortfolioCategories(): PortfolioCategory[] {
  return portfolioCategories;
}
