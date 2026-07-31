import type { NextConfig } from "next";

const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
const publicRemotePattern = (() => {
  if (!publicBaseUrl) {
    return null;
  }

  try {
    const url = new URL(publicBaseUrl);
    const basePath = url.pathname.replace(/\/$/, "");

    return {
      protocol: url.protocol === "http:" ? ("http" as const) : ("https" as const),
      hostname: url.hostname,
      port: url.port,
      pathname: `${basePath}/**`,
      search: "",
    };
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Keep Next's bundled image transformer disabled until its transitive Sharp
    // advisory is resolved. Public pages already select pre-generated variants;
    // private media must never pass through the public optimizer.
    unoptimized: true,
    minimumCacheTTL: 14_400,
    maximumRedirects: 0,
    maximumResponseBody: 15_000_000,
    qualities: [75],
    remotePatterns: publicRemotePattern ? [publicRemotePattern] : [],
  },
};

export default nextConfig;
