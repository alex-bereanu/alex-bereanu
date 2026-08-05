import Link from "next/link";
import { MediaJobStatus, MediaStatus, StorageDeletionStatus } from "@/generated/prisma/client";

import { AdminAlerts, AdminEmptyState, AdminShell, AdminStatus } from "@/app/admin/_components/admin-chrome";
import { categoryLabels } from "@/app/admin/_lib/admin-options";
import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { createCsrfToken } from "@/server/security/request-protection";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";

type AdminPageProps = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requireAdminPageSession("/admin");
  const resolvedSearchParams = await searchParams;
  const csrfToken = createCsrfToken();
  const phase2 = isAdminGalleryPhase2Enabled();

  if (!env.DATABASE_URL) {
    return (
      <AdminShell active="overview" title="Dashboard" description="A concise view of your studio, galleries, and client work." csrfToken={csrfToken}>
        <p className="admin-alert admin-alert-warning">DATABASE_URL is not configured. Set it in <code>.env.local</code> to enable admin features.</p>
      </AdminShell>
    );
  }

  const now = new Date();
  const [
    activeGalleriesCount,
    readyAssetsCount,
    pendingTicketsCount,
    activeLinksCount,
    pendingDeletionCount,
    pendingMediaJobCount,
    failedMediaJobCount,
    recentGalleries,
  ] = await Promise.all([
    prisma.gallery.count({ where: phase2 ? { status: "PUBLISHED" } : { isActive: true } }),
    prisma.galleryAsset.count({ where: { status: MediaStatus.READY, ...(phase2 ? { deletedAt: null } : {}) } }),
    prisma.ticket.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }),
    prisma.galleryShareLink.count({
      where: { isActive: true, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
    prisma.storageDeletionJob.count({ where: { status: StorageDeletionStatus.PENDING } }),
    prisma.mediaProcessingJob.count({
      where: { status: { in: [MediaJobStatus.PENDING, MediaJobStatus.PROCESSING, MediaJobStatus.RETRY] } },
    }),
    prisma.mediaProcessingJob.count({ where: { status: MediaJobStatus.FAILED } }),
    prisma.gallery.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        visibility: true,
        isActive: true,
        updatedAt: true,
        _count: { select: { assets: true } },
      },
    }),
  ]);

  const operationsNeedAttention = pendingDeletionCount + pendingMediaJobCount + failedMediaJobCount;

  return (
    <AdminShell
      active="overview"
      title="Dashboard"
      description="A concise view of gallery health, client activity, and the work that needs your attention."
      csrfToken={csrfToken}
      actions={<Link className="admin-primary-button" href="/admin/galleries/new">New gallery</Link>}
    >
      <AdminAlerts error={resolvedSearchParams.error} notice={resolvedSearchParams.notice} />

      {operationsNeedAttention > 0 ? (
        <section className="admin-alert admin-alert-warning flex flex-wrap items-center justify-between gap-3">
          <span>{operationsNeedAttention} background {operationsNeedAttention === 1 ? "item needs" : "items need"} review.</span>
          <Link className="admin-text-link" href="/admin/operations">Open operations</Link>
        </section>
      ) : null}

      <section className="admin-metrics" aria-label="Studio summary">
        <Link className="admin-metric" href="/admin/galleries">
          <p className="admin-metric-label">Active galleries</p><p className="admin-metric-value">{activeGalleriesCount}</p>
          <p className="admin-metric-note">Published and private collections</p>
        </Link>
        <Link className="admin-metric" href="/admin/galleries">
          <p className="admin-metric-label">Ready photos</p><p className="admin-metric-value">{readyAssetsCount}</p>
          <p className="admin-metric-note">Processed and available</p>
        </Link>
        <Link className="admin-metric" href="/admin/tickets?ticketStatus=NEW">
          <p className="admin-metric-label">Open tickets</p><p className="admin-metric-value">{pendingTicketsCount}</p>
          <p className="admin-metric-note">New or in progress</p>
        </Link>
        <Link className="admin-metric" href="/admin/galleries?access=active">
          <p className="admin-metric-label">Secure links</p><p className="admin-metric-value">{activeLinksCount}</p>
          <p className="admin-metric-note">Active and not expired</p>
        </Link>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.75fr)]">
        <section className="admin-panel">
          <div className="admin-panel-header">
            <div><h2>Recently updated</h2><p className="admin-panel-copy">Open a gallery workspace without loading its photos here.</p></div>
            <Link className="admin-text-link" href="/admin/galleries">All galleries</Link>
          </div>
          {recentGalleries.length === 0 ? (
            <AdminEmptyState title="Create the first gallery" body="Start a gallery, then add and arrange photos in its dedicated workspace." action={<Link className="admin-primary-button" href="/admin/galleries/new">Create gallery</Link>} />
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Gallery</th><th>Category</th><th>Photos</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  {recentGalleries.map((gallery) => (
                    <tr key={gallery.id}>
                      <td><Link className="font-semibold underline decoration-neutral-300 underline-offset-4" href={`/admin/galleries/${gallery.id}`}>{gallery.title}</Link><span className="mt-1 block text-xs text-neutral-500">/{gallery.slug}</span></td>
                      <td>{categoryLabels[gallery.category]}</td>
                      <td>{gallery._count.assets}</td>
                      <td className="space-x-1"><AdminStatus>{gallery.visibility}</AdminStatus><AdminStatus tone={gallery.isActive ? "success" : "neutral"}>{gallery.isActive ? "Active" : "Inactive"}</AdminStatus></td>
                      <td>{gallery.updatedAt.toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="admin-panel">
          <div className="admin-panel-header"><div><h2>Quick actions</h2><p className="admin-panel-copy">Common studio tasks.</p></div></div>
          <div className="grid gap-2">
            <Link className="admin-secondary-button justify-start" href="/admin/galleries/new">Create a gallery</Link>
            <Link className="admin-secondary-button justify-start" href="/admin/pages">Edit website text</Link>
            <Link className="admin-secondary-button justify-start" href="/admin/tickets">Review client tickets</Link>
            <Link className="admin-secondary-button justify-start" href="/admin/operations">Review processing health</Link>
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}
