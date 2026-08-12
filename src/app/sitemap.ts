import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { env } from "@/config/env";
import { buildSitemap, isWeddingHost } from "@/lib/seo";
import { getPublicGallerySitemapRecords } from "@/server/services/public-gallery";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const fallbackUrl = new URL(
    env.NEXT_PUBLIC_SITE_URL ??
      env.NEXT_PUBLIC_WEDDINGS_URL ??
      "http://localhost:3000",
  );
  const host =
    requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    requestHeaders.get("host") ||
    fallbackUrl.host;
  const protocol =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    "https";
  const requestOrigin = `${protocol}://${host}`;
  const galleries = isWeddingHost(host, env.NEXT_PUBLIC_WEDDINGS_URL)
    ? []
    : await getPublicGallerySitemapRecords();

  return buildSitemap({
    host,
    requestOrigin,
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    weddingsUrl: env.NEXT_PUBLIC_WEDDINGS_URL,
    galleries,
  });
}
