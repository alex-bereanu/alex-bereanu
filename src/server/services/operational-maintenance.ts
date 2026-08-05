import "server-only";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { emitOperationalEvent } from "@/server/observability/events";
import { reconcileExpiredUploadSessions } from "@/server/services/media-upload-sessions";
import { retryPendingStorageDeletions } from "@/server/services/storage-deletions";
import { purgeExpiredGalleryAssets } from "@/server/services/gallery-recycle-bin";
import { isAdminClientDeliveryPhase4Enabled } from "@/server/services/admin-client-delivery-phase4";

const DAY_MS = 24 * 60 * 60 * 1000;

function cutoff(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

export async function runOperationalMaintenance(): Promise<Record<string, number>> {
  const auditRetentionDays = env.AUDIT_RETENTION_DAYS ?? 365;
  const operationalCutoff = cutoff(90);
  const staleRateLimitCutoff = cutoff(1);

  const reconciledUploads = await reconcileExpiredUploadSessions(200);
  const purgedGalleryAssets = await purgeExpiredGalleryAssets(50);
  const retriedDeletions = await retryPendingStorageDeletions(100);

  const [
    expiredRateLimits,
    expiredSessions,
    oldAuditEvents,
    completedMediaJobs,
    completedDeletionJobs,
    oldEmailLogs,
    oldTickets,
  ] = await prisma.$transaction([
    prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: staleRateLimitCutoff } } }),
    prisma.adminSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoff(30) } },
          { revokedAt: { not: null, lt: cutoff(30) } },
        ],
      },
    }),
    prisma.securityAuditEvent.deleteMany({ where: { createdAt: { lt: cutoff(auditRetentionDays) } } }),
    prisma.mediaProcessingJob.deleteMany({
      where: { status: "COMPLETED", completedAt: { lt: operationalCutoff } },
    }),
    prisma.storageDeletionJob.deleteMany({
      where: { status: "COMPLETED", completedAt: { lt: operationalCutoff } },
    }),
    env.EMAIL_LOG_RETENTION_DAYS
      ? prisma.emailLog.deleteMany({ where: { createdAt: { lt: cutoff(env.EMAIL_LOG_RETENTION_DAYS) } } })
      : prisma.emailLog.deleteMany({ where: { id: { in: [] } } }),
    env.TICKET_RETENTION_DAYS
      ? prisma.ticket.deleteMany({ where: { createdAt: { lt: cutoff(env.TICKET_RETENTION_DAYS) } } })
      : prisma.ticket.deleteMany({ where: { id: { in: [] } } }),
  ]);

  const oldDeliveryLogs = isAdminClientDeliveryPhase4Enabled() && env.DELIVERY_LOG_RETENTION_DAYS
    ? await prisma.galleryAssetDelivery.deleteMany({
        where: { lastDeliveredAt: { lt: cutoff(env.DELIVERY_LOG_RETENTION_DAYS) } },
      })
    : { count: 0 };

  const [failedMediaJobs, pendingDeletionJobs, pendingUploads, oldestPendingMediaJob] = await Promise.all([
    prisma.mediaProcessingJob.count({ where: { status: "FAILED" } }),
    prisma.storageDeletionJob.count({ where: { status: "PENDING" } }),
    prisma.mediaUploadSession.count({ where: { status: { in: ["CREATED", "UPLOADED"] } } }),
    prisma.mediaProcessingJob.findFirst({
      where: { status: { in: ["PENDING", "PROCESSING", "RETRY"] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  const oldestPendingMediaJobAgeSeconds = oldestPendingMediaJob
    ? Math.max(0, Math.floor((Date.now() - oldestPendingMediaJob.createdAt.getTime()) / 1000))
    : 0;

  const result = {
    reconciledUploads,
    purgedGalleryAssets,
    retriedDeletions,
    expiredRateLimits: expiredRateLimits.count,
    expiredSessions: expiredSessions.count,
    oldAuditEvents: oldAuditEvents.count,
    oldDeliveryLogs: oldDeliveryLogs.count,
    completedMediaJobs: completedMediaJobs.count,
    completedDeletionJobs: completedDeletionJobs.count,
    oldEmailLogs: oldEmailLogs.count,
    oldTickets: oldTickets.count,
    failedMediaJobs,
    pendingDeletionJobs,
    pendingUploads,
    oldestPendingMediaJobAgeSeconds,
  };

  await emitOperationalEvent({
    kind: "maintenance",
    severity: failedMediaJobs > 0 || pendingDeletionJobs > 0 ? "warning" : "info",
    data: result,
  });
  return result;
}
