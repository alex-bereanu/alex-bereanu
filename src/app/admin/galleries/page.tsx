import { GalleryCategory, GalleryVisibility, Prisma } from "@/generated/prisma/client";
import Link from "next/link";

import { AdminAlerts, AdminFooter, AdminNav } from "@/app/admin/_components/admin-chrome";
import { categoryLabels } from "@/app/admin/_lib/admin-options";
import { env } from "@/config/env";
import { AdminArchiveUpload } from "@/components/admin-archive-upload";
import { AdminAssetManager } from "@/components/admin-asset-manager";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { AdminShareLinkForm } from "@/components/admin-share-link-form";
import { prisma } from "@/lib/db";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { createCsrfToken } from "@/server/security/request-protection";

type AdminGalleriesPageProps = {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    galleryQ?: string;
    view?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function AdminGalleriesPage({ searchParams }: AdminGalleriesPageProps) {
  await requireAdminPageSession("/admin/galleries");
  const resolvedSearchParams = await searchParams;
  const csrfToken = createCsrfToken();

  if (!env.DATABASE_URL) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <h1 className="text-3xl font-semibold">Galleries</h1>
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          DATABASE_URL is not configured. Set it in <code>.env.local</code> to enable gallery management.
        </p>
        <AdminFooter csrfToken={csrfToken} />
      </main>
    );
  }

  const galleryQuery = resolvedSearchParams.galleryQ?.trim() ?? "";
  const openExpanded = resolvedSearchParams.view === "expanded";

  const galleryWhere: Prisma.GalleryWhereInput = galleryQuery
    ? {
        OR: [
          { title: { contains: galleryQuery, mode: "insensitive" } },
          { slug: { contains: galleryQuery, mode: "insensitive" } },
          { description: { contains: galleryQuery, mode: "insensitive" } },
        ],
      }
    : {};

  const galleries = await prisma.gallery.findMany({
    where: galleryWhere,
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
    include: {
      _count: {
        select: {
          assets: true,
          shareLinks: true,
        },
      },
      assets: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        take: openExpanded ? 41 : 0,
        select: {
          id: true,
          originalFilename: true,
          smallStorageKey: true,
          mimeType: true,
          width: true,
          height: true,
          status: true,
          failureReason: true,
        },
      },
      shareLinks: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          slug: true,
          recipientEmail: true,
          expiresAt: true,
          isActive: true,
          tokenHash: true,
          revokedAt: true,
          createdAt: true,
        },
      },
    },
    take: 120,
  });

  const categoryOptions = Object.values(GalleryCategory);
  const visibilityOptions = Object.values(GalleryVisibility);
  const r2PublicBase = env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? null;
  const galleriesByCategory = categoryOptions.map((category) => ({
    category,
    galleries: galleries.filter((gallery) => gallery.category === category),
  }));
  const viewHref = openExpanded
    ? `/admin/galleries${galleryQuery ? `?galleryQ=${encodeURIComponent(galleryQuery)}` : ""}`
    : `/admin/galleries?view=expanded${galleryQuery ? `&galleryQ=${encodeURIComponent(galleryQuery)}` : ""}`;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-neutral-500">Admin</p>
            <h1 className="text-3xl font-semibold">Galleries</h1>
            <p className="text-sm text-neutral-700">
              Review galleries by category. Closed panels are compact; open a panel for editing, assets, archives, and custom links.
            </p>
          </div>
          <Link className="rounded bg-black px-4 py-2 text-sm font-medium text-white" href="/admin">
            Create gallery
          </Link>
        </div>
        <AdminNav active="galleries" />
      </header>

      <AdminAlerts error={resolvedSearchParams.error} notice={resolvedSearchParams.notice} />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded border bg-white p-4">
        <form className="flex flex-wrap items-center gap-2" method="get">
          {openExpanded ? <input type="hidden" name="view" value="expanded" /> : null}
          <input
            className="rounded border px-3 py-2 text-xs"
            name="galleryQ"
            defaultValue={galleryQuery}
            placeholder="Search galleries..."
          />
          <button className="rounded border bg-white px-3 py-2 text-xs font-medium" type="submit">
            Filter
          </button>
        </form>

        <Link className="rounded border bg-white px-3 py-2 text-xs font-medium" href={viewHref}>
          {openExpanded ? "Compact view" : "Expanded view"}
        </Link>
      </section>

      {galleries.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-700">
          No galleries match the current filter.
        </p>
      ) : (
        galleriesByCategory.map(({ category, galleries: categoryGalleries }) =>
          categoryGalleries.length > 0 ? (
            <section key={category} className="space-y-3">
              <div className="flex items-end justify-between border-b pb-2">
                <h2 className="text-xl font-semibold">{categoryLabels[category]}</h2>
                <p className="text-xs uppercase text-neutral-500">
                  {categoryGalleries.length} {categoryGalleries.length === 1 ? "gallery" : "galleries"}
                </p>
              </div>

              <div className="space-y-3">
                {categoryGalleries.map((gallery) => (
                  <details key={gallery.id} className="group rounded border bg-white" open={openExpanded}>
                    <summary className="grid cursor-pointer gap-3 p-4 marker:text-neutral-500 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-semibold">{gallery.title}</h3>
                          <span className="rounded border px-2 py-0.5 text-[11px] uppercase text-neutral-600">
                            {gallery.visibility}
                          </span>
                          <span
                            className={`rounded border px-2 py-0.5 text-[11px] uppercase ${
                              gallery.isActive ? "text-emerald-700" : "text-neutral-500"
                            }`}
                          >
                            {gallery.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-neutral-600">/{gallery.slug}</p>
                        {gallery.description ? (
                          <p className="mt-1 line-clamp-2 text-sm text-neutral-700">{gallery.description}</p>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs text-neutral-700">
                        <span className="rounded bg-neutral-50 px-3 py-2">
                          <strong className="block text-base text-neutral-950">{gallery._count.assets}</strong>
                          Assets
                        </span>
                        <span className="rounded bg-neutral-50 px-3 py-2">
                          <strong className="block text-base text-neutral-950">{gallery._count.shareLinks}</strong>
                          Links
                        </span>
                        <span className="rounded bg-neutral-50 px-3 py-2">
                          <strong className="block text-base text-neutral-950">{gallery.archiveFilename ? "Yes" : "No"}</strong>
                          ZIP
                        </span>
                      </div>
                    </summary>

                    {openExpanded ? (
                    <div className="border-t p-5">
                      <div className="grid gap-4 lg:grid-cols-3">
                        <div className="space-y-3 lg:col-span-2">
                          <form className="grid gap-2" action="/admin/actions/galleries/update" method="post">
                            <input type="hidden" name="csrfToken" value={csrfToken} />
                            <input type="hidden" name="id" value={gallery.id} />
                            <label className="form-field">
                              <span>Gallery Title</span>
                              <input className="rounded border px-3 py-2 text-sm" name="title" defaultValue={gallery.title} autoComplete="off" required />
                            </label>
                            <label className="form-field">
                              <span>URL Slug</span>
                              <input className="rounded border px-3 py-2 text-sm" name="slug" defaultValue={gallery.slug} autoComplete="off" spellCheck={false} required />
                            </label>
                            <label className="form-field">
                              <span>Category</span>
                              <select className="rounded border px-3 py-2 text-sm" name="category" defaultValue={gallery.category}>
                                {categoryOptions.map((option) => <option key={option} value={option}>{categoryLabels[option]}</option>)}
                              </select>
                            </label>
                            <label className="form-field">
                              <span>Visibility</span>
                              <select className="rounded border px-3 py-2 text-sm" name="visibility" defaultValue={gallery.visibility}>
                                {visibilityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </label>
                            <label className="form-field">
                              <span>Description <span className="font-normal text-neutral-500">(Optional)</span></span>
                              <textarea className="rounded border px-3 py-2 text-sm" name="description" defaultValue={gallery.description ?? ""} rows={3} />
                            </label>
                            <label className="inline-flex items-center gap-2 text-xs text-neutral-700">
                              <input type="checkbox" name="isActive" defaultChecked={gallery.isActive} /> Active
                            </label>
                            <button className="min-h-11 rounded border px-3 py-2 text-xs font-medium" type="submit">
                              Save Changes
                            </button>
                          </form>

                          <AdminAssetManager
                            key={`${gallery.id}:${gallery.assets.slice(0, 40).map((asset) => asset.id).join(",")}`}
                            galleryId={gallery.id}
                            assets={gallery.assets.slice(0, 40).map(({ smallStorageKey, ...asset }) => ({
                              ...asset,
                              previewUrl:
                                asset.status === "READY" && gallery.visibility === "PUBLIC" && r2PublicBase
                                  ? `${r2PublicBase}/${smallStorageKey}`
                                  : null,
                            }))}
                            csrfToken={csrfToken}
                            initialNextCursor={gallery.assets.length > 40 ? gallery.assets[39]?.id ?? null : null}
                            totalCount={gallery._count.assets}
                          />

                          <form action="/admin/actions/galleries/delete" method="post">
                            <input type="hidden" name="csrfToken" value={csrfToken} />
                            <input type="hidden" name="id" value={gallery.id} />
                            <ConfirmSubmitButton
                              className="min-h-11 rounded border border-red-300 px-3 py-2 text-xs font-medium text-red-700"
                              label="Delete Gallery"
                              confirmLabel="Delete Gallery Permanently"
                            />
                          </form>
                        </div>

                        <div className="space-y-3">
                          <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                            <p>Assets: {gallery._count.assets}</p>
                            <p>Custom links: {gallery._count.shareLinks}</p>
                            <p>Archive: {gallery.archiveFilename ?? "none"}</p>
                            <p>Archive status: {gallery.archiveStatus}</p>
                          </div>

                          <AdminArchiveUpload
                            galleryId={gallery.id}
                            csrfToken={csrfToken}
                            currentArchiveFilename={gallery.archiveFilename}
                          />

                          <form action="/admin/actions/galleries/archive-delete" method="post">
                            <input type="hidden" name="csrfToken" value={csrfToken} />
                            <input type="hidden" name="galleryId" value={gallery.id} />
                            <ConfirmSubmitButton
                              className="min-h-11 rounded border border-red-300 px-3 py-2 text-xs font-medium text-red-700"
                              label="Delete ZIP Archive"
                              confirmLabel="Delete ZIP Permanently"
                            />
                          </form>

                          {gallery.visibility === "PRIVATE" && gallery.isActive ? (
                            <AdminShareLinkForm csrfToken={csrfToken} galleryId={gallery.id} />
                          ) : (
                            <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                              Secure client links can only be created for active private galleries.
                            </p>
                          )}
                        </div>
                      </div>

                      {gallery.shareLinks.length > 0 ? (
                        <div className="mt-4 overflow-x-auto">
                          <table className="min-w-full text-left text-xs">
                            <thead>
                              <tr className="border-b text-neutral-600">
                                <th className="px-2 py-1">Capability</th>
                                <th className="px-2 py-1">Recipient</th>
                                <th className="px-2 py-1">Expires</th>
                                <th className="px-2 py-1">Status</th>
                                <th className="px-2 py-1">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gallery.shareLinks.map((link) => (
                                <tr key={link.id} className="border-b">
                                  <td className="px-2 py-1 font-medium">
                                    {link.tokenHash ? "Hashed secure token" : "Legacy link disabled"}
                                  </td>
                                  <td className="px-2 py-1">{link.recipientEmail ?? "-"}</td>
                                  <td className="px-2 py-1">{link.expiresAt ? link.expiresAt.toLocaleString() : "-"}</td>
                                  <td className="px-2 py-1">{link.isActive && !link.revokedAt ? "Active" : "Revoked"}</td>
                                  <td className="px-2 py-1">
                                    {link.isActive ? (
                                      <form action="/admin/actions/galleries/share-link-revoke" method="post">
                                        <input type="hidden" name="csrfToken" value={csrfToken} />
                                        <input type="hidden" name="galleryId" value={gallery.id} />
                                        <input type="hidden" name="shareLinkId" value={link.id} />
                                        <button className="rounded border border-red-300 px-2 py-1 text-red-700" type="submit">
                                          Revoke
                                        </button>
                                      </form>
                                    ) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                    ) : (
                      <div className="border-t p-4">
                        <Link
                          className="inline-flex rounded bg-black px-3 py-2 text-xs font-medium text-white"
                          href={`/admin/galleries?view=expanded&galleryQ=${encodeURIComponent(gallery.slug)}`}
                        >
                          Manage this gallery
                        </Link>
                      </div>
                    )}
                  </details>
                ))}
              </div>
            </section>
          ) : null,
        )
      )}

      <AdminFooter csrfToken={csrfToken} />
    </main>
  );
}
