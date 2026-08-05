import { MediaJobStatus, StorageDeletionStatus } from "@/generated/prisma/client";

import { AdminAlerts, AdminShell, AdminStatus } from "@/app/admin/_components/admin-chrome";
import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { createCsrfToken } from "@/server/security/request-protection";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";

type OperationsPageProps = { searchParams: Promise<{ notice?: string; error?: string; attempted?: string }> };
export const dynamic = "force-dynamic";

function formatQueueAge(createdAt: Date | null): string {
  if (!createdAt) return "No queued work";
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 1000));
  if (seconds < 60) return `Oldest queued ${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Oldest queued ${minutes} minutes`;
  return `Oldest queued ${Math.floor(minutes / 60)} hours`;
}

export default async function OperationsPage({ searchParams }: OperationsPageProps) {
  await requireAdminPageSession("/admin/operations");
  const params = await searchParams;
  const csrfToken = createCsrfToken();
  const phase2 = isAdminGalleryPhase2Enabled();

  if (!env.DATABASE_URL) {
    return <AdminShell active="operations" title="Operations" description="Media processing and storage cleanup health." csrfToken={csrfToken}><p className="admin-alert admin-alert-warning">DATABASE_URL is not configured.</p></AdminShell>;
  }

  const [pendingJobs, failedJobs, completedJobs, pendingDeletions, recentJobs, recycledPhotos, overdueRecycledPhotos, oldestPendingJob] = await Promise.all([
    prisma.mediaProcessingJob.count({ where: { status: { in: [MediaJobStatus.PENDING, MediaJobStatus.PROCESSING, MediaJobStatus.RETRY] } } }),
    prisma.mediaProcessingJob.count({ where: { status: MediaJobStatus.FAILED } }),
    prisma.mediaProcessingJob.count({ where: { status: MediaJobStatus.COMPLETED } }),
    prisma.storageDeletionJob.count({ where: { status: StorageDeletionStatus.PENDING } }),
    prisma.mediaProcessingJob.findMany({
      orderBy: { updatedAt: "desc" }, take: 40,
      select: { id: true, type: true, status: true, attempts: true, maxAttempts: true, lastError: true, updatedAt: true, asset: { select: { originalFilename: true } }, uploadSession: { select: { originalFilename: true } } },
    }),
    phase2 ? prisma.galleryAsset.count({ where: { deletedAt: { not: null } } }) : Promise.resolve(0),
    phase2 ? prisma.galleryAsset.count({ where: { deletedAt: { not: null }, purgeAfter: { lte: new Date() } } }) : Promise.resolve(0),
    prisma.mediaProcessingJob.findFirst({ where: { status: { in: [MediaJobStatus.PENDING, MediaJobStatus.PROCESSING, MediaJobStatus.RETRY] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  return (
    <AdminShell active="operations" title="Operations" description="Run the media queue, retry recoverable failures, and monitor deferred storage cleanup." csrfToken={csrfToken}>
      <AdminAlerts error={params.error} notice={params.notice} />

      <section className="admin-metrics" aria-label="Operations summary">
        <div className="admin-metric"><p className="admin-metric-label">Queued / active</p><p className="admin-metric-value">{pendingJobs}</p><p className="admin-metric-note">{formatQueueAge(oldestPendingJob?.createdAt ?? null)}</p></div>
        <div className="admin-metric"><p className="admin-metric-label">Failed jobs</p><p className="admin-metric-value">{failedJobs}</p><p className="admin-metric-note">Manual review may be required</p></div>
        <div className="admin-metric"><p className="admin-metric-label">Completed</p><p className="admin-metric-value">{completedJobs}</p><p className="admin-metric-note">Verified processing jobs</p></div>
        <div className="admin-metric"><p className="admin-metric-label">Storage cleanup</p><p className="admin-metric-value">{pendingDeletions}</p><p className="admin-metric-note">Deletions awaiting confirmation</p></div>
      </section>

      {phase2 ? <section className={`admin-alert ${overdueRecycledPhotos > 0 ? "admin-alert-warning" : "admin-alert-success"}`}>{recycledPhotos} photo{recycledPhotos === 1 ? " is" : "s are"} currently recoverable in Recycle Bins. {overdueRecycledPhotos > 0 ? `${overdueRecycledPhotos} passed retention and will be purged by the next scheduled maintenance run.` : "No photo is overdue for scheduled purge."}</section> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="admin-panel">
          <div className="admin-panel-header"><div><h2>Media queue</h2><p className="admin-panel-copy">Process a bounded batch. Uploaded photos remain unavailable until verification succeeds.</p></div></div>
          <form action="/admin/actions/media-jobs/run" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="limit" value="10" /><button className="admin-primary-button" type="submit">Process up to 10 jobs</button></form>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-header"><div><h2>Storage cleanup</h2><p className="admin-panel-copy">Retries are idempotent and work from the durable deletion queue.</p></div><AdminStatus tone={pendingDeletions > 0 ? "warning" : "success"}>{pendingDeletions} waiting</AdminStatus></div>
          <form action="/admin/actions/storage-deletions/retry" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="limit" value="200" /><button className="admin-secondary-button" type="submit">Retry storage deletions</button></form>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-header"><div><h2>Recent media jobs</h2><p className="admin-panel-copy">Only safe failure codes are displayed; sensitive provider responses remain server-side.</p></div></div>
        {recentJobs.length === 0 ? <p className="text-sm text-neutral-600">No media jobs are recorded.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>File</th><th>Job</th><th>Status</th><th>Attempts</th><th>Safe failure code</th><th>Updated</th><th>Action</th></tr></thead><tbody>{recentJobs.map((job) => <tr key={job.id}><td>{job.asset?.originalFilename ?? job.uploadSession?.originalFilename ?? "Unknown file"}</td><td>{job.type}</td><td><AdminStatus tone={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "danger" : "warning"}>{job.status}</AdminStatus></td><td>{job.attempts} / {job.maxAttempts}</td><td className="font-mono text-xs">{job.lastError ?? "—"}</td><td>{job.updatedAt.toLocaleString()}</td><td>{job.status === "FAILED" ? <form action="/admin/actions/media-jobs/retry" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="jobId" value={job.id} /><button className="admin-secondary-button" type="submit">Retry</button></form> : "—"}</td></tr>)}</tbody></table></div>}
      </section>
    </AdminShell>
  );
}
