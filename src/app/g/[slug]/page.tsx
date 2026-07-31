import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { GalleryLightbox } from "@/components/gallery-lightbox";
import { SiteFooter } from "@/components/site-footer";
import { TurnstileField } from "@/components/turnstile-field";
import { env } from "@/config/env";
import { createCsrfToken } from "@/server/security/request-protection";
import { getPrivateGalleryPageAccess } from "@/server/services/gallery-access";

type CustomGalleryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
};

const errorLabels: Record<string, string> = {
  invalid_password: "Invalid password. Please try again.",
  expired: "This gallery link has expired.",
  not_found: "Gallery link not found.",
  not_protected: "This gallery no longer requires a password.",
  rate_limited: "Too many password attempts. Please try again later.",
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

function normalizeDimensions(width: number | null, height: number | null) {
  return {
    width: width && width > 0 ? width : 4,
    height: height && height > 0 ? height : 3,
  };
}

export default async function CustomGalleryPage({ params, searchParams }: CustomGalleryPageProps) {
  const { slug: capabilityToken } = await params;
  const resolvedSearchParams = await searchParams;

  if (!env.DATABASE_URL) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10">
        <h1 className="editorial-heading text-4xl">Gallery unavailable</h1>
        <p className="text-sm text-neutral-700">Database is not configured yet on this environment.</p>
      </main>
    );
  }

  const access = await getPrivateGalleryPageAccess(capabilityToken);

  if (!access) {
    notFound();
  }

  if (!access.isAuthorized && !access.requiresPassword) {
    redirect(`/api/gallery-access/authorize/${encodeURIComponent(capabilityToken)}`);
  }

  if (!access.isAuthorized) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
        <div className="editorial-card rounded p-6">
          <h1 className="editorial-heading text-4xl">Private Gallery Access</h1>
          <p className="mt-2 text-sm text-neutral-700">Enter the gallery password provided by the photographer.</p>

          {resolvedSearchParams.error ? (
            <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 shadow-[0_12px_30px_rgba(185,28,28,0.08)]">
              {errorLabels[resolvedSearchParams.error] ?? "Unable to unlock gallery."}
            </p>
          ) : null}

          <form className="mt-5 grid gap-3" action="/api/gallery-access/unlock" method="post">
            <input type="hidden" name="slug" value={capabilityToken} />
            <input type="hidden" name="csrfToken" value={createCsrfToken()} />
            <input type="hidden" name="redirectTo" value={`/g/${capabilityToken}`} />
            <label className="grid gap-1 text-sm" htmlFor="gallery-password">
              <span>Password</span>
              <input
                id="gallery-password"
                className="editorial-input rounded px-3 py-2"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <TurnstileField action="gallery_unlock" siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
            <button className="editorial-button rounded px-4 py-2" type="submit">
              Unlock gallery
            </button>
          </form>

          <p className="mt-4 text-xs text-neutral-600">If you do not have the password, connect with the photographer.</p>
        </div>
      </main>
    );
  }

  const downloadsRemaining =
    access.maxDownloads === null ? null : Math.max(access.maxDownloads - access.downloadCount, 0);
  const canDownload = downloadsRemaining === null || downloadsRemaining > 0;
  const photos = access.gallery.assets.flatMap((asset) => {
    if (!asset.smallStorageKey) {
      return [];
    }

    const originalDimensions = normalizeDimensions(asset.width, asset.height);
    const smallDimensions = normalizeDimensions(asset.smallWidth ?? asset.width, asset.smallHeight ?? asset.height);
    const mediumDimensions = normalizeDimensions(asset.mediumWidth ?? asset.width, asset.mediumHeight ?? asset.height);
    const largeDimensions = normalizeDimensions(asset.largeWidth ?? asset.width, asset.largeHeight ?? asset.height);
    const smallSrc = `/api/gallery-media/assets/${asset.id}/small`;
    const mediumSrc = asset.mediumStorageKey
      ? `/api/gallery-media/assets/${asset.id}/medium`
      : smallSrc;
    const largeSrc = asset.largeStorageKey
      ? `/api/gallery-media/assets/${asset.id}/large`
      : mediumSrc;

    return [{
      id: asset.id,
      src: smallSrc,
      smallSrc,
      mediumSrc,
      largeSrc,
      width: originalDimensions.width,
      height: originalDimensions.height,
      smallWidth: smallDimensions.width,
      smallHeight: smallDimensions.height,
      mediumWidth: mediumDimensions.width,
      mediumHeight: mediumDimensions.height,
      largeWidth: largeDimensions.width,
      largeHeight: largeDimensions.height,
      placeholderDataUrl: asset.placeholderDataUrl ?? undefined,
      alt: asset.originalFilename,
      downloadHref: `/api/galleries/${capabilityToken}/assets/${asset.id}/download`,
    }];
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <nav className="flex items-center justify-between">
        <Link className="header-link" href="/portfolio">
          Back to portfolio
        </Link>
        <p className="text-xs text-neutral-600">Private client gallery</p>
      </nav>

      <header className="space-y-2">
        <h1 className="editorial-heading text-5xl">{access.gallery.title}</h1>
        {access.gallery.description ? <p className="text-sm text-neutral-700">{access.gallery.description}</p> : null}
      </header>

      <section className="flex flex-wrap gap-3">
        {access.gallery.archiveObjectKey ? (
          canDownload ? (
            <a className="editorial-button rounded px-4 py-2" href={`/api/galleries/${capabilityToken}/archive-download`}>
              Download full gallery ZIP
            </a>
          ) : (
            <span className="rounded bg-neutral-100 px-4 py-2 text-sm text-neutral-600">Download limit reached</span>
          )
        ) : (
          <span className="rounded bg-neutral-100 px-4 py-2 text-sm text-neutral-600">ZIP archive not uploaded yet</span>
        )}
      </section>

      {photos.length === 0 && access.gallery.assets.length > 0 ? (
        <p className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Secure previews are still being prepared. Originals are never used as a preview fallback.
        </p>
      ) : null}

      <GalleryLightbox
        photos={photos}
        disableOptimization
        initialNextCursor={access.gallery.nextCursor}
        loadMoreUrl="/api/gallery-media/assets"
        downloadBasePath={`/api/galleries/${capabilityToken}/assets`}
        totalCount={access.gallery.assetCount}
      />

      <section className="space-y-2">
        <h2 className="editorial-kicker text-neutral-700">Original downloads</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {canDownload ? (
            access.gallery.assets.map((asset) => (
              <a
                key={asset.id}
                className="editorial-card flex min-h-11 items-center rounded px-3 py-2 text-xs transition hover:-translate-y-0.5"
                href={`/api/galleries/${capabilityToken}/assets/${asset.id}/download`}
              >
                {asset.originalFilename}
              </a>
            ))
          ) : (
            <p className="text-sm text-neutral-600">Download limit reached for this gallery link.</p>
          )}
        </div>
      </section>

      <SiteFooter links={[{ href: "/portfolio", label: "Portfolio" }]} />
    </main>
  );
}
