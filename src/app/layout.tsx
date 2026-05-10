import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";

import { PhotoResourceHints } from "@/components/photo-resource-hints";
import { env } from "@/config/env";

import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteName = env.NEXT_PUBLIC_SITE_NAME ?? "Alex Bereanu";
const publicImageOrigin = env.R2_PUBLIC_BASE_URL ? new URL(env.R2_PUBLIC_BASE_URL).origin : undefined;

export const metadata: Metadata = {
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description:
    "Professional photography website with portfolio galleries, client delivery links, and direct booking workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <PhotoResourceHints publicImageOrigin={publicImageOrigin} />
        {children}
      </body>
    </html>
  );
}
