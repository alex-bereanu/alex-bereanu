import Link from "next/link";
import Image from "next/image";

import { ContactForm } from "@/components/contact-form";
import { HomepageHeroMosaic } from "@/components/homepage-hero-mosaic";
import { SiteFooter } from "@/components/site-footer";
import { env } from "@/config/env";
import { headerCategoryLinks } from "@/lib/site-data";
import { getPublicHomepageMosaicPhotos } from "@/server/services/public-gallery";
import { getSiteContent } from "@/server/services/site-content";
import { createCsrfToken } from "@/server/security/request-protection";

export const dynamic = "force-dynamic";

const IMAGE_QUALITY = 75;

export default async function Home() {
  const [heroPhotos, aboutContent, contactContent] = await Promise.all([
    getPublicHomepageMosaicPhotos(),
    getSiteContent("home.about"),
    getSiteContent("home.contact"),
  ]);
  const csrfToken = createCsrfToken();

  return (
    <div className="w-full">
      <header className="site-header mx-auto my-4 w-[calc(100%-2rem)] max-w-6xl rounded p-4 backdrop-blur">
        <div className="flex flex-col items-center gap-4">
          <div className="header-brand">Alex Bereanu</div>
          <nav className="header-nav text-sm">
            {headerCategoryLinks.map((category) => (
              <Link key={category.href} href={category.href} className="header-link">
                {category.label}
              </Link>
            ))}
            <a href="#about" className="header-link">
              About
            </a>
            <a href="#contact" className="header-link">
              Connect
            </a>
          </nav>
        </div>
      </header>

      <HomepageHeroMosaic photos={heroPhotos} />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 py-20 sm:px-6 lg:px-8">
        <section id="about" className="grid scroll-mt-28 gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="editorial-heading text-4xl">{aboutContent.title}</h2>
            <p className="text-sm text-neutral-700">
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
                quality={IMAGE_QUALITY}
              />
            ) : null}
          </div>
        </section>

        <section id="contact" className="scroll-mt-28 space-y-5">
          <h2 className="editorial-heading text-4xl">{contactContent.title}</h2>
          {contactContent.body ? <p className="text-sm text-neutral-700">{contactContent.body}</p> : null}
          <ContactForm csrfToken={csrfToken} turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
        </section>

        <SiteFooter
          links={[
            { href: "/portfolio", label: "Portfolio" },
            { href: "#contact", label: "Connect" },
          ]}
        />
      </main>
    </div>
  );
}
