import Link from "next/link";
import { GalleryCategory, GalleryStatus, GalleryVisibility, Prisma } from "@/generated/prisma/client";

import { AdminAlerts, AdminEmptyState, AdminShell, AdminStatus } from "@/app/admin/_components/admin-chrome";
import { categoryLabels } from "@/app/admin/_lib/admin-options";
import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { createCsrfToken } from "@/server/security/request-protection";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";

type AdminGalleriesPageProps = {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    q?: string;
    category?: string;
    visibility?: string;
    state?: string;
    access?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 30;

export const dynamic = "force-dynamic";

function enumValue<T extends string>(values: readonly T[], value?: string): T | undefined {
  return value && values.includes(value as T) ? value as T : undefined;
}

export default async function AdminGalleriesPage({ searchParams }: AdminGalleriesPageProps) {
  await requireAdminPageSession("/admin/galleries");
  const params = await searchParams;
  const csrfToken = createCsrfToken();
  const phase2 = isAdminGalleryPhase2Enabled();

  if (!env.DATABASE_URL) {
    return (
      <AdminShell active="galleries" title="Galleries" description="Manage public work and private client collections." csrfToken={csrfToken}>
        <p className="admin-alert admin-alert-warning">DATABASE_URL is not configured. Set it in <code>.env.local</code> to enable gallery management.</p>
      </AdminShell>
    );
  }

  const query = params.q?.trim().slice(0, 160) ?? "";
  const category = enumValue(Object.values(GalleryCategory), params.category);
  const visibility = enumValue(Object.values(GalleryVisibility), params.visibility);
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? "1", 10) || 1));
  const now = new Date();
  const where: Prisma.GalleryWhereInput = {
    ...(query ? { OR: [
      { title: { contains: query, mode: "insensitive" } },
      { slug: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
    ] } : {}),
    ...(category ? { category } : {}),
    ...(visibility ? { visibility } : {}),
    ...(phase2
      ? params.state && Object.values(GalleryStatus).includes(params.state.toUpperCase() as GalleryStatus)
        ? { status: params.state.toUpperCase() as GalleryStatus }
        : {}
      : params.state === "active" ? { isActive: true } : params.state === "inactive" ? { isActive: false } : {}),
    ...(params.access === "active" ? {
      shareLinks: { some: { isActive: true, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
    } : {}),
  };

  const [galleries, total, lifecycleRows] = await Promise.all([
    prisma.gallery.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        category: true,
        visibility: true,
        isActive: true,
        archiveStatus: true,
        updatedAt: true,
        _count: { select: { assets: phase2 ? { where: { deletedAt: null } } : true, shareLinks: { where: { isActive: true, revokedAt: null } } } },
      },
    }),
    prisma.gallery.count({ where }),
    phase2 ? prisma.gallery.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, status: true } }) : Promise.resolve([]),
  ]);
  const lifecycleById = new Map(lifecycleRows.map((row) => [row.id, row.status]));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (category) next.set("category", category);
    if (visibility) next.set("visibility", visibility);
    if (params.state) next.set("state", params.state);
    if (params.access === "active") next.set("access", "active");
    next.set("page", String(target));
    return `/admin/galleries?${next.toString()}`;
  };

  return (
    <AdminShell
      active="galleries"
      title="Galleries"
      description="A fast summary of every collection. Photos and management tools load only after you open a gallery."
      csrfToken={csrfToken}
      actions={<Link className="admin-primary-button" href="/admin/galleries/new">New gallery</Link>}
    >
      <AdminAlerts error={params.error} notice={params.notice} />

      <section className="admin-panel">
        <form className="admin-form-grid admin-form-grid-two" method="get">
          <label className="admin-form-field sm:col-span-2"><span>Search</span><input name="q" defaultValue={query} placeholder="Title, slug, or description" /></label>
          <label className="admin-form-field"><span>Category</span><select name="category" defaultValue={category ?? ""}><option value="">All categories</option>{Object.values(GalleryCategory).map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
          <label className="admin-form-field"><span>Visibility</span><select name="visibility" defaultValue={visibility ?? ""}><option value="">Public and private</option>{Object.values(GalleryVisibility).map((value) => <option key={value} value={value}>{value === "PUBLIC" ? "Public website" : "Private client"}</option>)}</select></label>
          <label className="admin-form-field"><span>State</span><select name="state" defaultValue={params.state ?? ""}><option value="">All states</option>{phase2 ? <><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></> : <><option value="active">Active</option><option value="inactive">Inactive</option></>}</select></label>
          <div className="flex items-end gap-2"><button className="admin-primary-button" type="submit">Apply filters</button><Link className="admin-secondary-button" href="/admin/galleries">Clear</Link></div>
        </form>
      </section>

      {galleries.length === 0 ? (
        <AdminEmptyState
          title={total === 0 && !query && !category && !visibility ? "Create your first gallery" : "No galleries match these filters"}
          body={total === 0 ? "Create a collection and then add photos in its dedicated workspace." : "Try clearing or widening the current filters."}
          action={<Link className="admin-primary-button" href="/admin/galleries/new">Create gallery</Link>}
        />
      ) : (
        <section className="admin-panel">
          <div className="admin-panel-header"><div><h2>{total} {total === 1 ? "gallery" : "galleries"}</h2><p className="admin-panel-copy">Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)}.</p></div></div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Gallery</th><th>Category</th><th>Content</th><th>Access</th><th>Status</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {galleries.map((gallery) => (
                  <tr key={gallery.id}>
                    <td className="max-w-sm"><Link className="font-semibold underline decoration-neutral-300 underline-offset-4" href={`/admin/galleries/${gallery.id}`}>{gallery.title}</Link><span className="mt-1 block text-xs text-neutral-500">/{gallery.slug}</span>{gallery.description ? <span className="mt-1 line-clamp-1 block text-xs text-neutral-600">{gallery.description}</span> : null}</td>
                    <td>{categoryLabels[gallery.category]}</td>
                    <td>{gallery._count.assets} {gallery._count.assets === 1 ? "photo" : "photos"}</td>
                    <td><AdminStatus>{gallery.visibility}</AdminStatus>{gallery._count.shareLinks > 0 ? <span className="mt-1 block text-xs text-neutral-500">{gallery._count.shareLinks} live link{gallery._count.shareLinks === 1 ? "" : "s"}</span> : null}</td>
                    <td>{(() => { const state = lifecycleById.get(gallery.id); return <AdminStatus tone={(state === "PUBLISHED" || (!phase2 && gallery.isActive)) ? "success" : state === "ARCHIVED" ? "warning" : "neutral"}>{state ?? (gallery.isActive ? "Active" : "Inactive")}</AdminStatus>; })()}</td>
                    <td>{gallery.updatedAt.toLocaleDateString()}</td>
                    <td><Link className="admin-secondary-button" href={`/admin/galleries/${gallery.id}`}>Manage</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? <nav aria-label="Gallery pages" className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-neutral-600">Page {page} of {totalPages}</span><div className="flex gap-2">{page > 1 ? <Link className="admin-secondary-button" href={pageHref(page - 1)}>Previous</Link> : null}{page < totalPages ? <Link className="admin-secondary-button" href={pageHref(page + 1)}>Next</Link> : null}</div></nav> : null}
        </section>
      )}
    </AdminShell>
  );
}
