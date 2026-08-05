import Link from "next/link";
import { notFound } from "next/navigation";
import { GalleryCategory, GalleryStatus, GalleryVisibility } from "@/generated/prisma/client";

import { AdminAlerts, AdminShell, AdminStatus } from "@/app/admin/_components/admin-chrome";
import { categoryLabels } from "@/app/admin/_lib/admin-options";
import { AdminAssetManager } from "@/components/admin-asset-manager";
import { AdminRecycleBin } from "@/components/admin-recycle-bin";
import { AdminShareLinkForm } from "@/components/admin-share-link-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { createCsrfToken } from "@/server/security/request-protection";
import { getGalleryRecycleRetentionDays, isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import { isAdminClientDeliveryPhase4Enabled } from "@/server/services/admin-client-delivery-phase4";
import { getGalleryDeliverySummary } from "@/server/services/client-delivery";

const tabs = ["details", "photos", "client-access", "downloads", "activity"] as const;
type GalleryTab = (typeof tabs)[number];
type GalleryWorkspaceProps = { params: Promise<{ galleryId: string }>; searchParams: Promise<{ tab?: string; view?: string; notice?: string; error?: string }> };

export const dynamic = "force-dynamic";

function resolveTab(value?: string): GalleryTab { return tabs.includes(value as GalleryTab) ? value as GalleryTab : "details"; }
function tabLabel(tab: GalleryTab): string { return ({ details: "Details", photos: "Photos", "client-access": "Client access", downloads: "Downloads", activity: "Activity" })[tab]; }

async function getAdminPhotoRows(galleryId: string, phase2: boolean) {
  if (phase2) {
    return prisma.galleryAsset.findMany({
      where: { galleryId, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 41,
      select: { id: true, originalFilename: true, mimeType: true, width: true, height: true, status: true, failureReason: true, altText: true, caption: true, focalX: true, focalY: true, capturedAt: true },
    });
  }
  const rows = await prisma.galleryAsset.findMany({
    where: { galleryId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 41,
    select: { id: true, originalFilename: true, mimeType: true, width: true, height: true, status: true, failureReason: true, capturedAt: true },
  });
  return rows.map((row) => ({ ...row, altText: null, caption: null, focalX: null, focalY: null }));
}

async function getAdminShareLinks(galleryId: string, phase4: boolean) {
  if (phase4) {
    return prisma.galleryShareLink.findMany({
      where: { galleryId }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, slug: true, recipientEmail: true, expiresAt: true, isActive: true, tokenHash: true, revokedAt: true, replacedAt: true, replacedById: true, lastAccessedAt: true, createdAt: true, _count: { select: { deliveries: true } } },
    });
  }
  const rows = await prisma.galleryShareLink.findMany({
    where: { galleryId }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, slug: true, recipientEmail: true, expiresAt: true, isActive: true, tokenHash: true, revokedAt: true, lastAccessedAt: true, createdAt: true },
  });
  return rows.map((row) => ({ ...row, replacedAt: null, replacedById: null, _count: { deliveries: 0 } }));
}

export default async function GalleryWorkspace({ params, searchParams }: GalleryWorkspaceProps) {
  const { galleryId } = await params;
  await requireAdminPageSession(`/admin/galleries/${galleryId}`);
  const query = await searchParams;
  const activeTab = resolveTab(query.tab);
  const photoView = query.view === "recycle" ? "recycle" : "active";
  const csrfToken = createCsrfToken();
  const phase2 = isAdminGalleryPhase2Enabled();
  const phase4 = phase2 && isAdminClientDeliveryPhase4Enabled();

  if (!env.DATABASE_URL) return <AdminShell active="galleries" title="Gallery workspace" csrfToken={csrfToken}><p className="admin-alert admin-alert-warning">DATABASE_URL is not configured.</p></AdminShell>;

  const [gallery, phase2State] = await Promise.all([
    prisma.gallery.findUnique({
      where: { id: galleryId },
      select: {
        id: true, title: true, slug: true, description: true, category: true, visibility: true, isActive: true,
        archiveFilename: true, archiveStatus: true, archiveFailureReason: true, archiveUploadedAt: true,
        createdAt: true, updatedAt: true,
        _count: { select: { assets: phase2 ? { where: { deletedAt: null } } : true, shareLinks: true } },
      },
    }),
    phase2 ? prisma.gallery.findUnique({ where: { id: galleryId }, select: { status: true, clientDeliveryEnabled: true } }) : Promise.resolve(null),
  ]);
  if (!gallery) notFound();
  const lifecycle = phase2State?.status ?? (gallery.isActive ? GalleryStatus.PUBLISHED : GalleryStatus.DRAFT);

  const [photoRows, recycledRows, recycleCount, shareLinks, activityJobs, activityEvents, moveTargets, publishCounts, deliverySummary] = await Promise.all([
    activeTab === "photos" && photoView === "active" ? getAdminPhotoRows(galleryId, phase2) : Promise.resolve([]),
    activeTab === "photos" && photoView === "recycle" && phase2
      ? prisma.galleryAsset.findMany({ where: { galleryId, deletedAt: { not: null } }, orderBy: { deletedAt: "desc" }, take: 40, select: { id: true, originalFilename: true, width: true, height: true, deletedAt: true, purgeAfter: true } })
      : Promise.resolve([]),
    phase2 ? prisma.galleryAsset.count({ where: { galleryId, deletedAt: { not: null } } }) : Promise.resolve(0),
    activeTab === "client-access" ? getAdminShareLinks(galleryId, phase4) : Promise.resolve([]),
    activeTab === "activity" ? prisma.mediaProcessingJob.findMany({ where: { OR: [{ asset: { galleryId } }, { uploadSession: { galleryId } }] }, orderBy: { updatedAt: "desc" }, take: 40, select: { id: true, type: true, status: true, attempts: true, lastError: true, updatedAt: true, asset: { select: { originalFilename: true } }, uploadSession: { select: { originalFilename: true } } } }) : Promise.resolve([]),
    activeTab === "activity" ? prisma.securityAuditEvent.findMany({ where: { resourceType: "gallery", resourceId: galleryId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, eventType: true, outcome: true, metadata: true, createdAt: true } }) : Promise.resolve([]),
    activeTab === "photos" && photoView === "active" && phase2 ? prisma.gallery.findMany({ where: { id: { not: galleryId }, visibility: gallery.visibility, status: { not: GalleryStatus.ARCHIVED } }, orderBy: { title: "asc" }, take: 100, select: { id: true, title: true } }) : Promise.resolve([]),
    phase2 ? Promise.all([
      prisma.galleryAsset.count({ where: { galleryId, deletedAt: null, status: "READY" } }),
      prisma.galleryAsset.count({ where: { galleryId, deletedAt: null, status: { in: ["UPLOADING", "PROCESSING", "FAILED", "DELETING"] } } }),
    ]) : Promise.resolve([gallery._count.assets, 0]),
    activeTab === "downloads" && phase4 ? getGalleryDeliverySummary(galleryId) : Promise.resolve({ deliveredPhotoCount: 0, recent: [] }),
  ]);

  const photos = photoRows.slice(0, 40).map((asset) => ({
    ...asset, capturedAt: asset.capturedAt?.toISOString() ?? null,
    previewUrl: asset.status === "READY" ? `/admin/media/assets/${asset.id}/small` : null,
  }));
  const recycled = recycledRows.flatMap((asset) => asset.deletedAt && asset.purgeAfter ? [{ ...asset, deletedAt: asset.deletedAt.toISOString(), purgeAfter: asset.purgeAfter.toISOString(), previewUrl: `/admin/media/assets/${asset.id}/small` }] : []);
  const canPublish = publishCounts[0] > 0 && publishCounts[1] === 0;
  const isPublished = lifecycle === GalleryStatus.PUBLISHED;
  const clientDeliveryEnabled = Boolean(phase2State?.clientDeliveryEnabled);
  const activeReplaceableLinks = shareLinks
    .filter((link) => link.isActive && !link.revokedAt && (!link.expiresAt || link.expiresAt > new Date()))
    .map((link) => ({ id: link.id, label: `${link.recipientEmail ?? "Unassigned client"} · ${link.createdAt.toLocaleDateString()}` }));

  return (
    <AdminShell
      active="galleries" eyebrow={`Galleries / ${categoryLabels[gallery.category]}`} title={gallery.title}
      description={`/${gallery.slug} · ${gallery._count.assets} active ${gallery._count.assets === 1 ? "photo" : "photos"}`}
      csrfToken={csrfToken}
      actions={<><Link className="admin-primary-button" href={`/admin/galleries/${gallery.id}/preview`} target="_blank">Preview gallery</Link>{gallery.visibility === "PUBLIC" && isPublished ? <Link className="admin-secondary-button" href={`/portfolio/galleries/${gallery.slug}`} target="_blank">View live</Link> : null}<Link className="admin-secondary-button" href="/admin/galleries">All galleries</Link></>}
    >
      <AdminAlerts error={query.error} notice={query.notice} />
      {!phase2 ? <p className="admin-alert admin-alert-warning">Phase 2 is installed but disabled until its additive migration passes the Phase 0 backup, direct-connection, staging, and authorization gates. The current gallery behavior remains active.</p> : null}

      <div className="flex flex-wrap gap-2" aria-label="Gallery state">
        <AdminStatus>{gallery.visibility}</AdminStatus>
        <AdminStatus tone={isPublished ? "success" : lifecycle === "ARCHIVED" ? "warning" : "neutral"}>{phase2 ? lifecycle : gallery.isActive ? "Active" : "Inactive"}</AdminStatus>
        {recycleCount > 0 ? <AdminStatus tone="warning">{recycleCount} recycled</AdminStatus> : null}
        {gallery.archiveStatus !== "NONE" ? <AdminStatus tone="warning">Legacy archive: {gallery.archiveStatus}</AdminStatus> : null}
        {phase4 ? <AdminStatus tone={clientDeliveryEnabled ? "success" : "neutral"}>Client delivery {clientDeliveryEnabled ? "on" : "off"}</AdminStatus> : null}
      </div>

      <nav aria-label="Gallery workspace" className="admin-tabs">{tabs.map((tab) => <Link key={tab} className="admin-tab" data-active={tab === activeTab ? "true" : "false"} href={`/admin/galleries/${gallery.id}?tab=${tab}`}>{tabLabel(tab)}</Link>)}</nav>

      {activeTab === "details" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="admin-panel">
            <div className="admin-panel-header"><div><h2>Gallery details</h2><p className="admin-panel-copy">Save descriptive fields independently from publishing the collection.</p></div></div>
            <form className="admin-form-grid admin-form-grid-two" action="/admin/actions/galleries/update" method="post">
              <input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="id" value={gallery.id} />
              <label className="admin-form-field"><span>Gallery title</span><input name="title" defaultValue={gallery.title} autoComplete="off" required /></label>
              <label className="admin-form-field"><span>URL slug</span><input name="slug" defaultValue={gallery.slug} autoComplete="off" spellCheck={false} required /></label>
              <label className="admin-form-field"><span>Category</span><select name="category" defaultValue={gallery.category}>{Object.values(GalleryCategory).map((option) => <option key={option} value={option}>{categoryLabels[option]}</option>)}</select></label>
              <label className="admin-form-field"><span>Visibility</span><select name="visibility" defaultValue={gallery.visibility}>{Object.values(GalleryVisibility).map((option) => <option key={option} value={option}>{option === "PUBLIC" ? "Public website" : "Private client"}</option>)}</select><span className="admin-form-helper">Visibility cannot change while stored files exist because public and private storage are isolated.</span></label>
              <label className="admin-form-field sm:col-span-2"><span>Description (optional)</span><textarea name="description" defaultValue={gallery.description ?? ""} /></label>
              {!phase2 ? <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={gallery.isActive} /> Active and available</label> : null}
              <div className="sm:col-span-2"><button className="admin-primary-button" type="submit">Save details</button></div>
            </form>
          </section>

          <aside className="grid content-start gap-4">
            {phase2 ? <section className="admin-panel">
              <div className="admin-panel-header"><div><h2>Publication</h2><p className="admin-panel-copy">Drafts are hidden. Publishing requires at least one ready photo and no blocking media state.</p></div></div>
              <div className="mb-4 grid gap-2 text-xs"><p>{publishCounts[0]} ready photo{publishCounts[0] === 1 ? "" : "s"}</p><p>{publishCounts[1]} blocking media item{publishCounts[1] === 1 ? "" : "s"}</p></div>
              <div className="grid gap-2">
                {lifecycle !== "PUBLISHED" ? <form action="/admin/actions/galleries/lifecycle" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="galleryId" value={gallery.id} /><input type="hidden" name="status" value="PUBLISHED" /><button className="admin-primary-button w-full" type="submit" disabled={!canPublish}>Publish gallery</button></form> : <form action="/admin/actions/galleries/lifecycle" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="galleryId" value={gallery.id} /><input type="hidden" name="status" value="DRAFT" /><button className="admin-secondary-button w-full" type="submit">Unpublish to draft</button></form>}
                {lifecycle !== "ARCHIVED" ? <form action="/admin/actions/galleries/lifecycle" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="galleryId" value={gallery.id} /><input type="hidden" name="status" value="ARCHIVED" /><ConfirmSubmitButton className="admin-danger-button w-full" label="Archive gallery" confirmLabel="Archive and revoke links" /></form> : <form action="/admin/actions/galleries/lifecycle" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="galleryId" value={gallery.id} /><input type="hidden" name="status" value="DRAFT" /><button className="admin-secondary-button w-full" type="submit">Restore as draft</button></form>}
              </div>
            </section> : null}
            <section className="admin-panel">
              <div className="admin-panel-header"><div><h2>Collection record</h2><p className="admin-panel-copy">Created {gallery.createdAt.toLocaleDateString()} · Updated {gallery.updatedAt.toLocaleString()}</p></div></div>
              <dl className="grid gap-3 text-sm"><div><dt className="text-xs uppercase tracking-wide text-neutral-500">Active photos</dt><dd className="mt-1 text-lg">{gallery._count.assets}</dd></div><div><dt className="text-xs uppercase tracking-wide text-neutral-500">Client links</dt><dd className="mt-1 text-lg">{gallery._count.shareLinks}</dd></div></dl>
              {!phase2 || lifecycle === "ARCHIVED" ? <form className="mt-6 border-t border-neutral-200 pt-5" action="/admin/actions/galleries/delete" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="id" value={gallery.id} /><ConfirmSubmitButton className="admin-danger-button" label="Delete gallery" confirmLabel="Delete permanently" /></form> : <p className="mt-5 border-t border-neutral-200 pt-4 text-xs text-neutral-600">Archive this gallery before permanent deletion.</p>}
            </section>
          </aside>
        </div>
      ) : null}

      {activeTab === "photos" ? (
        <section className="admin-panel">
          <div className="admin-panel-header"><div><h2>{photoView === "recycle" ? "Recycle Bin" : "Photo workspace"}</h2><p className="admin-panel-copy">{photoView === "recycle" ? `Removed photos stay recoverable for ${getGalleryRecycleRetentionDays()} days, then the maintenance worker purges them.` : "Upload originals, monitor verification, edit metadata, select batches, and arrange the full collection."}</p></div><AdminStatus tone={gallery._count.assets > 0 ? "success" : "neutral"}>{gallery._count.assets} active</AdminStatus></div>
          {phase2 ? <nav className="mb-5 flex flex-wrap gap-2" aria-label="Photo workspace views"><Link className={photoView === "active" ? "admin-primary-button" : "admin-secondary-button"} href={`/admin/galleries/${gallery.id}?tab=photos`}>Active photos</Link><Link className={photoView === "recycle" ? "admin-primary-button" : "admin-secondary-button"} href={`/admin/galleries/${gallery.id}?tab=photos&view=recycle`}>Recycle Bin ({recycleCount})</Link></nav> : null}
          {photoView === "recycle" && phase2 ? <AdminRecycleBin galleryId={gallery.id} assets={recycled} csrfToken={csrfToken} /> : <AdminAssetManager key={`${gallery.id}:${photos.map((asset) => asset.id).join(",")}`} galleryId={gallery.id} assets={photos} csrfToken={csrfToken} initialNextCursor={photoRows.length > 40 ? photoRows[39]?.id ?? null : null} totalCount={gallery._count.assets} phase2Enabled={phase2} moveTargets={moveTargets} />}
        </section>
      ) : null}

      {activeTab === "client-access" ? (
        <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <section className="admin-panel self-start"><div className="admin-panel-header"><div><h2>Create secure link</h2><p className="admin-panel-copy">Capability tokens are shown once and stored only as hashes. Replacement revokes the old capability atomically.</p></div></div>{gallery.visibility === "PRIVATE" && isPublished && (!phase4 || clientDeliveryEnabled) ? <AdminShareLinkForm csrfToken={csrfToken} galleryId={gallery.id} phase4Enabled={phase4} replaceableLinks={activeReplaceableLinks} /> : <p className="admin-alert admin-alert-warning">{phase4 ? "Publish this private gallery and enable client delivery in Downloads before creating a link." : "Secure links require a published private gallery."}</p>}</section>
          <section className="admin-panel"><div className="admin-panel-header"><div><h2>Link history</h2><p className="admin-panel-copy">Status is derived from expiry, revocation, and replacement. Previously issued tokens are never recoverable here.</p></div></div>{shareLinks.length === 0 ? <p className="text-sm text-neutral-600">No secure links have been created for this gallery.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Recipient</th><th>Created / expires</th><th>Activity</th><th>Status</th><th>Action</th></tr></thead><tbody>{shareLinks.map((link) => { const expired = Boolean(link.expiresAt && link.expiresAt <= new Date()); const active = link.isActive && !link.revokedAt && !expired; const status = link.replacedAt ? "Replaced" : expired ? "Expired" : active ? "Active" : "Revoked"; return <tr key={link.id}><td>{link.recipientEmail ?? "Unassigned"}<span className="block text-xs text-neutral-500">{link.tokenHash ? "Secure capability" : "Legacy disabled"}</span></td><td>{link.createdAt.toLocaleString()}<span className="block text-xs text-neutral-500">{link.expiresAt ? `Expires ${link.expiresAt.toLocaleString()}` : "No expiry"}</span></td><td>{link.lastAccessedAt ? `Opened ${link.lastAccessedAt.toLocaleString()}` : "Never opened"}{phase4 ? <span className="block text-xs text-neutral-500">{link._count.deliveries} delivered photo{link._count.deliveries === 1 ? "" : "s"}</span> : null}</td><td><AdminStatus tone={active ? "success" : link.replacedAt ? "warning" : "neutral"}>{status}</AdminStatus></td><td>{active ? <form action="/admin/actions/galleries/share-link-revoke" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="galleryId" value={gallery.id} /><input type="hidden" name="shareLinkId" value={link.id} /><button className="admin-danger-button" type="submit">Revoke</button></form> : "—"}</td></tr>; })}</tbody></table></div>}</section>
        </div>
      ) : null}

      {activeTab === "downloads" ? <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]"><section className="admin-panel self-start"><div className="admin-panel-header"><div><h2>Full-quality delivery</h2><p className="admin-panel-copy">One authorized Save / Share action per photo. Originals remain in private storage.</p></div><AdminStatus tone={phase4 && clientDeliveryEnabled ? "success" : "warning"}>{phase4 ? clientDeliveryEnabled ? "Enabled" : "Disabled" : "Phase 4 off"}</AdminStatus></div>{phase4 ? <><p className="admin-panel-copy">Enabling requires a published private gallery with only READY active photos. Disabling immediately revokes every active client link.</p><form className="mt-5" action="/admin/actions/galleries/client-delivery" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="galleryId" value={gallery.id} /><input type="hidden" name="enabled" value={clientDeliveryEnabled ? "false" : "true"}/>{clientDeliveryEnabled ? <ConfirmSubmitButton className="admin-danger-button w-full" label="Disable and revoke links" confirmLabel="Disable client delivery" /> : <button className="admin-primary-button w-full" type="submit" disabled={gallery.visibility !== "PRIVATE" || !isPublished || !canPublish}>Enable client delivery</button>}</form></> : <p className="admin-alert admin-alert-warning">Phase 4 is installed but disabled until its additive migration and Phase 0 staging checkpoint pass.</p>}{gallery.archiveFilename ? <div className="mt-6 border-t border-neutral-200 pt-5"><p className="text-sm font-semibold">Legacy ZIP found</p><p className="mt-1 text-xs leading-5 text-neutral-600">ZIP upload and download are removed from the normal workflow. Delete this object through the durable storage outbox after individual delivery is verified.</p><form className="mt-4" action="/admin/actions/galleries/archive-delete" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="galleryId" value={gallery.id} /><ConfirmSubmitButton className="admin-danger-button" label="Delete legacy ZIP" confirmLabel="Delete ZIP permanently" /></form></div> : null}</section><section className="admin-panel"><div className="admin-panel-header"><div><h2>Successful photo deliveries</h2><p className="admin-panel-copy">One row per secure link and photo. A retry updates its latest successful transfer instead of consuming a request counter.</p></div><AdminStatus tone={deliverySummary.deliveredPhotoCount > 0 ? "success" : "neutral"}>{deliverySummary.deliveredPhotoCount} delivered</AdminStatus></div>{!phase4 ? <p className="admin-empty-state text-sm text-neutral-600">Delivery records become available after Phase 4 activation.</p> : deliverySummary.recent.length === 0 ? <p className="admin-empty-state text-sm text-neutral-600">No original has completed a full transfer yet.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Photo</th><th>Client link</th><th>Method</th><th>First / latest</th><th>Source proof</th></tr></thead><tbody>{deliverySummary.recent.map((delivery) => <tr key={delivery.id}><td>{delivery.asset.originalFilename}</td><td>{delivery.shareLink.recipientEmail ?? delivery.shareLink.slug}</td><td>{delivery.method}</td><td>{delivery.firstDeliveredAt.toLocaleString()}<span className="block text-xs text-neutral-500">Latest {delivery.lastDeliveredAt.toLocaleString()}</span></td><td>{delivery.sourceContentHash ? <span className="font-mono text-xs">{delivery.sourceContentHash.slice(0, 12)}…</span> : "Hash unavailable"}<span className="block text-xs text-neutral-500">{Number(delivery.sourceSizeBytes / BigInt(1024) / BigInt(1024))} MB</span></td></tr>)}</tbody></table></div>}</section></div> : null}

      {activeTab === "activity" ? <div className="grid gap-4"><section className="admin-panel"><div className="admin-panel-header"><div><h2>Gallery audit trail</h2><p className="admin-panel-copy">Lifecycle, recycle, restore, purge, metadata, and batch actions. Tokens, object keys, and personal content are never recorded here.</p></div></div>{activityEvents.length === 0 ? <p className="text-sm text-neutral-600">No gallery audit events are recorded yet.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Event</th><th>Outcome</th><th>Time</th></tr></thead><tbody>{activityEvents.map((event) => <tr key={event.id}><td>{event.eventType}</td><td><AdminStatus tone={event.outcome === "SUCCESS" ? "success" : "danger"}>{event.outcome}</AdminStatus></td><td>{event.createdAt.toLocaleString()}</td></tr>)}</tbody></table></div>}</section><section className="admin-panel"><div className="admin-panel-header"><div><h2>Processing activity</h2><p className="admin-panel-copy">Latest media jobs associated with this gallery.</p></div></div>{activityJobs.length === 0 ? <p className="text-sm text-neutral-600">No media-processing activity is recorded.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>File</th><th>Job</th><th>Status</th><th>Attempts</th><th>Updated</th></tr></thead><tbody>{activityJobs.map((job) => <tr key={job.id}><td>{job.asset?.originalFilename ?? job.uploadSession?.originalFilename ?? "Unknown file"}</td><td>{job.type}</td><td><AdminStatus tone={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "danger" : "warning"}>{job.status}</AdminStatus>{job.lastError ? <span className="mt-1 block font-mono text-xs text-red-700">{job.lastError}</span> : null}</td><td>{job.attempts}</td><td>{job.updatedAt.toLocaleString()}</td></tr>)}</tbody></table></div>}</section></div> : null}
    </AdminShell>
  );
}
