import type { MetadataRoute } from "next";

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
