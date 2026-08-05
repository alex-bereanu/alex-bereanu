import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublishedSiteContentDocument, getPublicSiteChromeContent } from "@/server/services/site-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublishedSiteContentDocument("weddings.landing");
  return { title: content.values.seoTitle || content.values.title, description: content.values.seoDescription || content.values.body };
}

export default async function WeddingsPage() {
  const [content, chrome] = await Promise.all([getPublishedSiteContentDocument("weddings.landing"), getPublicSiteChromeContent()]);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <SiteHeader brandName={chrome.brandName} className="rounded p-4 backdrop-blur" links={[{ href: "/", label: chrome.labels.home }, ...chrome.categoryLinks, { href: "/portfolio/weddings", label: content.values.ctaTitle || "Wedding Portfolio" }]} />
      <header className="space-y-3"><p className="text-xs uppercase tracking-[0.2em] text-neutral-600">{content.values.subtitle}</p><h1 className="editorial-heading text-5xl">{content.values.title}</h1><p className="max-w-2xl whitespace-pre-wrap text-sm text-neutral-700">{content.values.body}</p></header>
      <section className="rounded-lg bg-neutral-50 p-8 shadow-[0_12px_30px_rgba(23,18,15,0.06)]"><p className="whitespace-pre-wrap text-sm text-neutral-700">{content.values.ctaBody}</p><Link className="editorial-button mt-5 inline-flex rounded px-4 py-2" href="/portfolio/weddings">{content.values.ctaTitle || "View Wedding Portfolio"}</Link></section>
      <SiteFooter links={[{ href: "/portfolio/weddings", label: chrome.categoryLinks.find((link) => link.href.endsWith("/weddings"))?.label || "Weddings" }]} />
    </main>
  );
}
