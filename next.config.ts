import type { NextConfig } from "next";

const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2Hostname = r2AccountId ? `${r2AccountId}.r2.cloudflarestorage.com` : "*.r2.cloudflarestorage.com";
const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
const unoptimizedImages = process.env.NODE_ENV === "development" || process.env.NEXT_IMAGE_UNOPTIMIZED === "true";
const publicBaseHostname = (() => {
  if (!publicBaseUrl) {
    return null;
  }

  try {
    return new URL(publicBaseUrl).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    unoptimized: unoptimizedImages,
    minimumCacheTTL: 2678400,
    qualities: [75, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.r2.dev",
      },
      {
        protocol: "https",
        hostname: r2Hostname,
      },
      ...(publicBaseHostname
        ? [
            {
              protocol: "https" as const,
              hostname: publicBaseHostname,
            },
          ]
        : []),
      {
        protocol: "https",
        hostname: "assets.domain.example",
      },
    ],
  },
};

export default nextConfig;
