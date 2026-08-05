import Image from "next/image";
import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
import { HomepageHeroMosaic } from "@/components/homepage-hero-mosaic";
import { PhotoResourceHints } from "@/components/photo-resource-hints";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/config/env";
import { getPublicHomepageMosaicPhotos } from "@/server/services/public-gallery";
import { buildSiteContentMetadata, getPublicSiteChromeContent, getSiteContents } from "@/server/services/site-content";
import { createCsrfToken } from "@/server/security/request-protection";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [about, chrome] = await Promise.all([getSiteContents(["home.about"]), getPublicSiteChromeContent()]);
  const content = about[0];
  return content ? buildSiteContentMetadata(content, "/") : { title: chrome.brandName };
}

const IMAGE_QUALITY = 75;

export default async function Home() {
  const [heroPhotos, contents, chrome] = await Promise.all([
    getPublicHomepageMosaicPhotos(),
    getSiteContents(["home.about", "home.contact"]),
    getPublicSiteChromeContent(),
  ]);
  const [aboutContent, contactContent] = contents;
  const csrfToken = createCsrfToken();

  return (
    <div className="w-full">
      <PhotoResourceHints publicImageOrigin={env.R2_PUBLIC_BASE_URL ? new URL(env.R2_PUBLIC_BASE_URL).origin : undefined} />
      <SiteHeader
        brandName={chrome.brandName}
        className="mx-auto my-4 w-[calc(100%-2rem)] max-w-6xl rounded p-4 backdrop-blur"
        links={[...chrome.categoryLinks, { href: "#about", label: chrome.labels.about }, { href: "#contact", label: chrome.labels.connect }]}
      />

      <HomepageHeroMosaic photos={heroPhotos} />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 py-20 sm:px-6 lg:px-8">
        <h1 className="sr-only">{chrome.brandName} Photography</h1>
        <section id="about" className="grid scroll-mt-28 gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="editorial-heading text-4xl">{aboutContent.title}</h2>
            <p className="whitespace-pre-wrap text-sm text-neutral-700">
              {aboutContent.body}
            </p>
          </div>
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[416px] overflow-hidden rounded bg-[linear-gradient(120deg,_#fffdf8,_#d8d0c5)] shadow-[0_18px_50px_rgba(23,18,15,0.08)] lg:mx-0">
            {aboutContent.imageSrc ? (
              <Image
                src={aboutContent.imageSrc}
                alt={aboutContent.imageAlt ?? aboutContent.title}
                fill
                sizes="(min-width: 416px) 416px, 100vw"
                className="object-cover"
                style={{ objectPosition: `${(aboutContent.imageFocalX ?? 0.5) * 100}% ${(aboutContent.imageFocalY ?? 0.5) * 100}%` }}
                quality={IMAGE_QUALITY}
              />
            ) : null}
          </div>
        </section>

        <section id="contact" className="scroll-mt-28 space-y-5">
          <h2 className="editorial-heading text-4xl">{contactContent.title}</h2>
          {contactContent.body ? <p className="whitespace-pre-wrap text-sm text-neutral-700">{contactContent.body}</p> : null}
          <ContactForm csrfToken={csrfToken} turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
        </section>

        <SiteFooter
          links={[
            { href: "/portfolio", label: chrome.labels.portfolio },
            { href: "#contact", label: chrome.labels.connect },
          ]}
        />
      </main>
    </div>
  );
}
