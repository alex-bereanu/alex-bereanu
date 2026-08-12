import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { env } from "@/config/env";
import { buildRobots } from "@/lib/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
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

  return buildRobots({
    host,
    requestOrigin: `${protocol}://${host}`,
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    weddingsUrl: env.NEXT_PUBLIC_WEDDINGS_URL,
  });
}
