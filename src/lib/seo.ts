import type { Metadata, MetadataRoute } from "next";

const passthroughPrefixes = ["/api/", "/admin/", "/g/"];
const passthroughPaths = new Set(["/robots.txt", "/sitemap.xml", "/favicon.ico"]);
const mainSitemapPaths = [
  "/",
  "/portfolio",
  "/portfolio/weddings",
  "/portfolio/portraits",
  "/portfolio/automotive",
  "/portfolio/landscapes",
] as const;
const DEFAULT_WEDDING_TITLE =
  "Wedding Photographer Bucharest | Alex Bereanu";
const DEFAULT_WEDDING_DESCRIPTION =
  "Documentary and editorial wedding photography in Bucharest, Romania, with destination wedding coverage available worldwide.";

export type CanonicalRedirectInput = {
  host: string;
  pathname: string;
  search: string;
  siteUrl?: string;
  weddingsUrl?: string;
};

export type GallerySitemapRecord = {
  slug: string;
  updatedAt: Date;
};

export type SeoRouteInput = {
  host: string;
  requestOrigin: string;
  siteUrl?: string;
  weddingsUrl?: string;
};

export type ResolvedWeddingSeo = {
  title: string;
  description: string;
  canonical: string;
  imageUrl?: string;
  imageAlt?: string;
};

export type ResolveWeddingSeoInput = {
  weddingsUrl?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  imageUrl?: string;
  imageAlt?: string;
};

function rootUrl(value?: string): URL | null {
  if (!value) return null;

  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function normalizedHost(host: string): string {
  return host.split(",")[0]?.trim().toLowerCase() ?? "";
}

function isPassthroughPath(pathname: string): boolean {
  const finalSegment = pathname.split("/").at(-1) ?? "";
  return (
    passthroughPaths.has(pathname) ||
    passthroughPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    finalSegment.includes(".")
  );
}

function redirectUrl(root: URL, pathname: string, search: string): string {
  const target = new URL(pathname, root);
  target.search = search;
  return target.toString();
}

export function isWeddingHost(host: string, weddingsUrl?: string): boolean {
  const weddingsRoot = rootUrl(weddingsUrl);
  return Boolean(weddingsRoot && normalizedHost(host) === weddingsRoot.host.toLowerCase());
}

export function getCanonicalRedirect(input: CanonicalRedirectInput): string | null {
  const siteRoot = rootUrl(input.siteUrl);
  const weddingsRoot = rootUrl(input.weddingsUrl);
  const host = normalizedHost(input.host);

  if (siteRoot && weddingsRoot && host === siteRoot.host.toLowerCase() && input.pathname === "/weddings") {
    return redirectUrl(weddingsRoot, "/", input.search);
  }

  if (!weddingsRoot || host !== weddingsRoot.host.toLowerCase() || input.pathname === "/" || isPassthroughPath(input.pathname)) {
    return null;
  }

  if (input.pathname === "/weddings") {
    return redirectUrl(weddingsRoot, "/", input.search);
  }

  return siteRoot ? redirectUrl(siteRoot, input.pathname, input.search) : null;
}

function canonicalRoot(input: SeoRouteInput): URL {
  const configuredRoot = isWeddingHost(input.host, input.weddingsUrl)
    ? rootUrl(input.weddingsUrl)
    : rootUrl(input.siteUrl);
  return configuredRoot ?? rootUrl(input.requestOrigin)!;
}

export function buildSitemap(
  input: SeoRouteInput & { galleries: GallerySitemapRecord[] },
): MetadataRoute.Sitemap {
  const root = canonicalRoot(input);

  if (isWeddingHost(input.host, input.weddingsUrl)) {
    return [{ url: root.toString() }];
  }

  return [
    ...mainSitemapPaths.map((pathname) => ({
      url: new URL(pathname, root).toString(),
    })),
    ...input.galleries.map((gallery) => ({
      url: new URL(
        `/portfolio/galleries/${encodeURIComponent(gallery.slug)}`,
        root,
      ).toString(),
      lastModified: gallery.updatedAt,
    })),
  ];
}

export function buildRobots(input: SeoRouteInput): MetadataRoute.Robots {
  const root = canonicalRoot(input);
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/g/"],
    },
    sitemap: new URL("/sitemap.xml", root).toString(),
  };
}

export function resolveWeddingSeo(
  input: ResolveWeddingSeoInput,
): ResolvedWeddingSeo {
  return {
    title: input.seoTitle?.trim() || DEFAULT_WEDDING_TITLE,
    description:
      input.seoDescription?.trim() || DEFAULT_WEDDING_DESCRIPTION,
    canonical: rootUrl(input.weddingsUrl)?.toString() ?? "/weddings",
    imageUrl: input.imageUrl,
    imageAlt: input.imageAlt,
  };
}

export function buildWeddingMetadata(seo: ResolvedWeddingSeo): Metadata {
  const images = seo.imageUrl
    ? [{ url: seo.imageUrl, alt: seo.imageAlt ?? seo.title }]
    : undefined;

  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical: seo.canonical },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: seo.canonical,
      images,
    },
    twitter: {
      card: seo.imageUrl ? "summary_large_image" : "summary",
      title: seo.title,
      description: seo.description,
      images: seo.imageUrl ? [seo.imageUrl] : undefined,
    },
  };
}

export function buildWeddingServiceJsonLd(input: {
  seo: ResolvedWeddingSeo;
  brandName: string;
  siteUrl?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Wedding photography",
    serviceType: "Wedding photography",
    url: input.seo.canonical,
    description: input.seo.description,
    provider: {
      "@type": "ProfessionalService",
      name: input.brandName,
      url: rootUrl(input.siteUrl)?.toString() ?? input.seo.canonical,
    },
    areaServed: [
      { "@type": "City", name: "Bucharest" },
      { "@type": "Country", name: "Romania" },
      { "@type": "Place", name: "Worldwide" },
    ],
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
