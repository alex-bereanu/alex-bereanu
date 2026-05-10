import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";

import { env } from "@/config/env";
import { GalleryLightbox } from "@/components/gallery-lightbox";
import { SiteFooter } from "@/components/site-footer";
import { prisma } from "@/lib/db";
import { getGalleryAccessCookieName, verifyGalleryAccessToken } from "@/server/auth/gallery-access";
import { buildGalleryPhotoFromAsset } from "@/server/services/public-gallery";

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

export default async function CustomGalleryPage({ params, searchParams }: CustomGalleryPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  if (!env.DATABASE_URL) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10">
        <h1 className="editorial-heading text-4xl">Gallery unavailable</h1>
        <p className="text-sm text-neutral-700">Database is not configured yet on this environment.</p>
      </main>
    );
  }

  const shareLink = await prisma.galleryShareLink.findFirst({
    where: {
      slug,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      gallery: {
        include: {
          assets: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });

  if (!shareLink) {
    notFound();
  }

  const hasPassword = Boolean(shareLink.passwordHash);
  let canAccess = !hasPassword;

  if (hasPassword) {
    const accessToken = (await cookies()).get(getGalleryAccessCookieName())?.value;

    if (accessToken) {
      canAccess = await verifyGalleryAccessToken(accessToken, slug);
    }
  }

  if (!canAccess) {
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
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="redirectTo" value={`/g/${slug}`} />
            <input className="editorial-input rounded px-3 py-2" name="password" type="password" placeholder="Password" required />
            <button className="editorial-button rounded px-4 py-2" type="submit">
              Unlock gallery
            </button>
          </form>

          <p className="mt-4 text-xs text-neutral-600">If you do not have the password, connect with the photographer.</p>
        </div>
      </main>
    );
  }

  const publicBase = env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? null;
  const photos = publicBase
    ? shareLink.gallery.assets.flatMap((asset) => {
        const photo = buildGalleryPhotoFromAsset(
          asset,
          asset.originalFilename,
          `/api/galleries/${slug}/assets/${asset.id}/download`,
        );

        return photo ? [photo] : [];
      })
    : [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <nav className="flex items-center justify-between">
        <Link className="header-link" href="/portfolio">
          Back to portfolio
        </Link>
        <p className="text-xs text-neutral-600">Custom gallery: {slug}</p>
      </nav>

      <header className="space-y-2">
        <h1 className="editorial-heading text-5xl">{shareLink.gallery.title}</h1>
        {shareLink.gallery.description ? <p className="text-sm text-neutral-700">{shareLink.gallery.description}</p> : null}
      </header>

      <section className="flex flex-wrap gap-3">
        {shareLink.gallery.archiveObjectKey ? (
          <a
            className="editorial-button rounded px-4 py-2"
            href={`/api/galleries/${slug}/archive-download`}
          >
            Download full gallery ZIP
          </a>
        ) : (
          <span className="rounded bg-neutral-100 px-4 py-2 text-sm text-neutral-600">ZIP archive not uploaded yet</span>
        )}
      </section>

      {!publicBase ? (
        <p className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-[0_12px_30px_rgba(146,64,14,0.08)]">
          R2_PUBLIC_BASE_URL is not configured, so preview images cannot be rendered yet. Direct downloads still work.
        </p>
      ) : null}

      <GalleryLightbox photos={photos} />

      <section className="space-y-2">
        <h2 className="editorial-kicker text-neutral-700">Original downloads</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shareLink.gallery.assets.map((asset) => (
            <a
              key={asset.id}
              className="editorial-card rounded px-3 py-2 text-xs transition hover:-translate-y-0.5"
              href={`/api/galleries/${slug}/assets/${asset.id}/download`}
            >
              {asset.originalFilename}
            </a>
          ))}
        </div>
      </section>

      <SiteFooter links={[{ href: "/portfolio", label: "Portfolio" }]} />
    </main>
  );
}
