import { Prisma, SiteContentRevisionStatus, StorageArea } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { getSiteContentDefinition, isSiteContentDocumentKey, mergeSiteContentPayload } from "@/lib/site-content-registry";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { isAdminContentPhase3Enabled } from "@/server/services/admin-content-phase3";
import { invalidateSiteContentKey } from "@/server/services/public-cache";
import { deleteObjectByKey, getObjectBuffer, uploadObject } from "@/server/services/storage";
import { hashContentActor } from "@/server/services/site-content-revisions";
import { attemptStorageDeletions, enqueueStorageDeletions, type StorageDeletionTarget } from "@/server/services/storage-deletions";

const schema = z.object({ key: z.string().trim().min(1).max(120), revisionId: z.string().trim().min(1).max(200) });

function redirectEditor(request: Request, key: string | undefined, query: string) {
  return NextResponse.redirect(new URL(`${key ? `/admin/pages/${encodeURIComponent(key)}` : "/admin/pages"}?${query}`, request.url), 303);
}

async function promoteImage(revision: {
  id: string; contentKey: string; imageStorageArea: "PUBLIC" | "PRIVATE" | null;
  imageObjectKey: string | null; imageSmallObjectKey: string | null; imageMediumObjectKey: string | null;
  imageSmallWidth: number | null; imageSmallHeight: number | null; imageSmallSizeBytes: bigint | null;
  imageMediumWidth: number | null; imageMediumHeight: number | null; imageMediumSizeBytes: bigint | null;
}) {
  if (!revision.imageSmallObjectKey && !revision.imageMediumObjectKey) return { promotedKeys: [] as string[], data: {} };
  if (revision.imageStorageArea === StorageArea.PUBLIC) return {
    promotedKeys: [] as string[], data: {
      imageObjectKey: revision.imageObjectKey, imageSmallObjectKey: revision.imageSmallObjectKey,
      imageSmallWidth: revision.imageSmallWidth, imageSmallHeight: revision.imageSmallHeight, imageSmallSizeBytes: revision.imageSmallSizeBytes,
      imageMediumObjectKey: revision.imageMediumObjectKey, imageMediumWidth: revision.imageMediumWidth, imageMediumHeight: revision.imageMediumHeight, imageMediumSizeBytes: revision.imageMediumSizeBytes,
    },
  };
  if (!revision.imageSmallObjectKey || !revision.imageMediumObjectKey) throw new Error("draft_image_variants_incomplete");
  const [small, medium] = await Promise.all([
    getObjectBuffer(revision.imageSmallObjectKey, "PRIVATE"),
    getObjectBuffer(revision.imageMediumObjectKey, "PRIVATE"),
  ]);
  const prefix = `site-content/${revision.contentKey.replace(/\./g, "/")}/published/${revision.id}`;
  const smallKey = `${prefix}/small.webp`;
  const mediumKey = `${prefix}/medium.webp`;
  try {
    await Promise.all([
      uploadObject({ area: "PUBLIC", objectKey: smallKey, contentType: "image/webp", body: small }),
      uploadObject({ area: "PUBLIC", objectKey: mediumKey, contentType: "image/webp", body: medium }),
    ]);
  } catch (error) {
    await Promise.allSettled([deleteObjectByKey(smallKey, "PUBLIC"), deleteObjectByKey(mediumKey, "PUBLIC")]);
    throw error;
  }
  return { promotedKeys: [smallKey, mediumKey], data: {
    imageObjectKey: mediumKey, imageSmallObjectKey: smallKey,
    imageSmallWidth: revision.imageSmallWidth, imageSmallHeight: revision.imageSmallHeight, imageSmallSizeBytes: revision.imageSmallSizeBytes,
    imageMediumObjectKey: mediumKey, imageMediumWidth: revision.imageMediumWidth, imageMediumHeight: revision.imageMediumHeight, imageMediumSizeBytes: revision.imageMediumSizeBytes,
  } };
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;
  if (!env.DATABASE_URL) return redirectEditor(request, undefined, "error=database_not_configured");
  if (!isAdminContentPhase3Enabled()) return redirectEditor(request, undefined, "error=content_phase3_not_enabled");
  let key: string | undefined;
  let promotedKeys: string[] = [];
  let published = false;
  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));
    if (securityError) return securityError;
    const parsed = schema.parse({ key: formData.get("key"), revisionId: formData.get("revisionId") });
    if (!isSiteContentDocumentKey(parsed.key)) throw new Error("invalid_content_key");
    key = parsed.key;
    const definition = getSiteContentDefinition(parsed.key);
    const revision = await prisma.siteContentRevision.findFirst({ where: { id: parsed.revisionId, contentKey: parsed.key, status: SiteContentRevisionStatus.DRAFT } });
    if (!revision) return redirectEditor(request, key, "error=content_draft_not_found");
    const values = mergeSiteContentPayload(parsed.key, revision.payload);
    const promoted = await promoteImage(revision);
    promotedKeys = promoted.promotedKeys;
    const privateDraftTargets: StorageDeletionTarget[] = revision.imageStorageArea === StorageArea.PRIVATE
      ? [...new Set([revision.imageObjectKey, revision.imageSmallObjectKey, revision.imageMediumObjectKey].filter((objectKey): objectKey is string => Boolean(objectKey)))].map((objectKey) => ({ area: "PRIVATE" as const, objectKey }))
      : [];
    const actorHash = hashContentActor(getClientIp(request));
    await prisma.$transaction(async (transaction) => {
      await enqueueStorageDeletions(transaction, privateDraftTargets);
      await transaction.siteContentRevision.updateMany({ where: { contentKey: parsed.key, status: SiteContentRevisionStatus.PUBLISHED }, data: { status: SiteContentRevisionStatus.SUPERSEDED } });
      const claimed = await transaction.siteContentRevision.updateMany({ where: { id: revision.id, status: SiteContentRevisionStatus.DRAFT }, data: { status: SiteContentRevisionStatus.PUBLISHED, publishedAt: new Date(), ...(promoted.promotedKeys.length > 0 ? { ...promoted.data, imageStorageArea: StorageArea.PUBLIC } : {}) } });
      if (claimed.count !== 1) throw new Error("content_draft_publish_conflict");
      await transaction.siteContent.upsert({
        where: { key: parsed.key },
        create: {
          key: parsed.key, title: values.title ?? null, subtitle: values.subtitle ?? null, body: values.body ?? null,
          ctaTitle: values.ctaTitle ?? null, ctaBody: values.ctaBody ?? null,
          imageAlt: definition.supportsImage ? revision.imageAlt : null, imageFocalX: revision.imageFocalX, imageFocalY: revision.imageFocalY,
          seoTitle: values.seoTitle || null, seoDescription: values.seoDescription || null,
          publishedPayload: revision.payload as Prisma.InputJsonValue, publishedRevisionId: revision.id, publishedAt: new Date(), publishedByActorHash: actorHash,
          ...promoted.data,
        },
        update: {
          title: values.title ?? null, subtitle: values.subtitle ?? null, body: values.body ?? null,
          ctaTitle: values.ctaTitle ?? null, ctaBody: values.ctaBody ?? null,
          imageAlt: definition.supportsImage ? revision.imageAlt : null, imageFocalX: revision.imageFocalX, imageFocalY: revision.imageFocalY,
          seoTitle: values.seoTitle || null, seoDescription: values.seoDescription || null,
          publishedPayload: revision.payload as Prisma.InputJsonValue, publishedRevisionId: revision.id, publishedAt: new Date(), publishedByActorHash: actorHash,
          imageObjectKey: null, imageSmallObjectKey: null, imageSmallWidth: null, imageSmallHeight: null, imageSmallSizeBytes: null,
          imageMediumObjectKey: null, imageMediumWidth: null, imageMediumHeight: null, imageMediumSizeBytes: null,
          ...promoted.data,
        },
        select: { key: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    published = true;
    await attemptStorageDeletions(privateDraftTargets);
    invalidateSiteContentKey(parsed.key);
    if (!definition.publicPath.includes("[")) revalidatePath(definition.publicPath);
    await recordSecurityAuditEvent({ eventType: "site.content.publish", outcome: "SUCCESS", clientIp: getClientIp(request), resourceType: "site_content", resourceId: parsed.key, metadata: { revision_id: revision.id, version: revision.version } });
    return redirectEditor(request, key, `notice=content_published&revision=${encodeURIComponent(revision.id)}`);
  } catch (error) {
    if (!published && promotedKeys.length > 0) await Promise.allSettled(promotedKeys.map((objectKey) => deleteObjectByKey(objectKey, "PUBLIC")));
    await recordSecurityAuditEvent({ eventType: "site.content.publish", outcome: "ERROR", clientIp: getClientIp(request), resourceType: "site_content", resourceId: key });
    return redirectEditor(request, key, `error=${error instanceof z.ZodError ? "invalid_content_publish" : "content_publish_failed"}`);
  }
}
