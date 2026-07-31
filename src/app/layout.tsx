import type { Metadata, Viewport } from "next";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";
import { env } from "@/config/env";

import "./globals.css";

const siteName = env.NEXT_PUBLIC_SITE_NAME ?? "Alex Bereanu";

export const metadata: Metadata = {
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description:
    "Professional photography website with portfolio galleries, client delivery links, and direct booking workflows.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        {env.OBSERVABILITY_WEBHOOK_URL ? (
          <WebVitalsReporter sampleRate={env.WEB_VITALS_SAMPLE_RATE ?? 0.1} />
        ) : null}
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
