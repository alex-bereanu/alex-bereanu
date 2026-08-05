import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GalleryLightbox } from "@/components/gallery-lightbox";
import { prisma } from "@/lib/db";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";

type PreviewPageProps = { params: Promise<{ galleryId: string }> };
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

function dimensions(width: number | null, height: number | null) { return { width: width && width > 0 ? width : 4, height: height && height > 0 ? height : 3 }; }

export default async function AdminGalleryPreview({ params }: PreviewPageProps) {
  const { galleryId } = await params;
  await requireAdminPageSession(`/admin/galleries/${galleryId}/preview`);
  const phase2 = isAdminGalleryPhase2Enabled();
  const gallery = await prisma.gallery.findUnique({ where: { id: galleryId }, select: { id: true, title: true, description: true, visibility: true } });
  if (!gallery) notFound();

  const assets = phase2
    ? await prisma.galleryAsset.findMany({ where: { galleryId, deletedAt: null, status: "READY" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 41, select: { id: true, originalFilename: true, altText: true, width: true, height: true, smallWidth: true, smallHeight: true, mediumWidth: true, mediumHeight: true, largeWidth: true, largeHeight: true, placeholderDataUrl: true, mediumStorageKey: true, largeStorageKey: true } })
    : (await prisma.galleryAsset.findMany({ where: { galleryId, status: "READY" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 41, select: { id: true, originalFilename: true, width: true, height: true, smallWidth: true, smallHeight: true, mediumWidth: true, mediumHeight: true, largeWidth: true, largeHeight: true, placeholderDataUrl: true, mediumStorageKey: true, largeStorageKey: true } })).map((asset) => ({ ...asset, altText: null }));
  const pageAssets = assets.slice(0, 40);
  const photos = pageAssets.map((asset) => {
    const original = dimensions(asset.width, asset.height);
    const small = dimensions(asset.smallWidth ?? asset.width, asset.smallHeight ?? asset.height);
    const medium = dimensions(asset.mediumWidth ?? asset.width, asset.mediumHeight ?? asset.height);
    const large = dimensions(asset.largeWidth ?? asset.width, asset.largeHeight ?? asset.height);
    const smallSrc = `/admin/media/assets/${asset.id}/small`;
    return {
      id: asset.id, src: smallSrc, smallSrc,
      mediumSrc: asset.mediumStorageKey ? `/admin/media/assets/${asset.id}/medium` : smallSrc,
      largeSrc: asset.largeStorageKey ? `/admin/media/assets/${asset.id}/large` : asset.mediumStorageKey ? `/admin/media/assets/${asset.id}/medium` : smallSrc,
      width: original.width, height: original.height, smallWidth: small.width, smallHeight: small.height,
      mediumWidth: medium.width, mediumHeight: medium.height, largeWidth: large.width, largeHeight: large.height,
      placeholderDataUrl: asset.placeholderDataUrl ?? undefined, alt: asset.altText?.trim() || asset.originalFilename,
    };
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4"><Link className="header-link" href={`/admin/galleries/${gallery.id}?tab=photos`}>Back to Admin</Link><p className="text-xs uppercase tracking-wide text-neutral-600">Authenticated {gallery.visibility.toLowerCase()} preview</p></nav>
      <header className="space-y-2"><h1 className="editorial-heading text-5xl">{gallery.title}</h1>{gallery.description ? <p className="max-w-3xl whitespace-pre-wrap text-sm text-neutral-700">{gallery.description}</p> : null}</header>
      {photos.length > 0 ? <GalleryLightbox photos={photos} disableOptimization initialNextCursor={null} totalCount={photos.length} /> : <p className="rounded border border-dashed border-neutral-300 p-6 text-sm text-neutral-600">No ready photos are available for preview.</p>}
    </main>
  );
}
