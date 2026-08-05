import "server-only";

import { createHmac } from "node:crypto";
import { Prisma, SiteContentRevisionStatus, StorageArea } from "@/generated/prisma/client";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  getSiteContentDefinition,
  mergeSiteContentPayload,
  siteContentRegistry,
  type SiteContentDocumentKey,
} from "@/lib/site-content-registry";
import { getPublishedSiteContentDocument } from "@/server/services/site-content";

export type ContentRevisionView = {
  id: string;
  contentKey: SiteContentDocumentKey;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "SUPERSEDED";
  values: Record<string, string>;
  imageObjectKey?: string;
  imageSmallObjectKey?: string;
  imageMediumObjectKey?: string;
  imageStorageArea?: "PUBLIC" | "PRIVATE";
  imageAlt?: string;
  imageFocalX?: number;
  imageFocalY?: number;
  restoredFromRevisionId?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};

const revisionSelect = {
  id: true, contentKey: true, version: true, status: true, payload: true,
  imageObjectKey: true, imageSmallObjectKey: true, imageSmallWidth: true, imageSmallHeight: true, imageSmallSizeBytes: true,
  imageMediumObjectKey: true, imageMediumWidth: true, imageMediumHeight: true, imageMediumSizeBytes: true,
  imageStorageArea: true, imageAlt: true, imageFocalX: true, imageFocalY: true,
  restoredFromRevisionId: true, createdAt: true, updatedAt: true, publishedAt: true,
} satisfies Prisma.SiteContentRevisionSelect;

type RevisionRow = Prisma.SiteContentRevisionGetPayload<{ select: typeof revisionSelect }>;

function toView(row: RevisionRow): ContentRevisionView {
  const key = row.contentKey as SiteContentDocumentKey;
  return {
    id: row.id,
    contentKey: key,
    version: row.version,
    status: row.status,
    values: mergeSiteContentPayload(key, row.payload),
    imageObjectKey: row.imageObjectKey ?? undefined,
    imageSmallObjectKey: row.imageSmallObjectKey ?? undefined,
    imageMediumObjectKey: row.imageMediumObjectKey ?? undefined,
    imageStorageArea: row.imageStorageArea ?? undefined,
    imageAlt: row.imageAlt ?? undefined,
    imageFocalX: row.imageFocalX ?? undefined,
    imageFocalY: row.imageFocalY ?? undefined,
    restoredFromRevisionId: row.restoredFromRevisionId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString(),
  };
}

export function hashContentActor(actor: string | null | undefined): string | null {
  const secret = env.AUDIT_LOG_SECRET ?? env.CSRF_SECRET;
  if (!secret || !actor) return null;
  return createHmac("sha256", secret).update(actor).digest("hex");
}

export async function getAdminContentSummaries() {
  const keys = siteContentRegistry.map((definition) => definition.key);
  const [contents, latestDrafts, revisionCounts] = await Promise.all([
    prisma.siteContent.findMany({ where: { key: { in: keys } }, select: { key: true, publishedRevisionId: true, publishedAt: true, updatedAt: true } }),
    prisma.siteContentRevision.findMany({ where: { contentKey: { in: keys }, status: SiteContentRevisionStatus.DRAFT }, orderBy: [{ updatedAt: "desc" }], distinct: ["contentKey"], select: { id: true, contentKey: true, version: true, updatedAt: true } }),
    prisma.siteContentRevision.groupBy({ by: ["contentKey"], where: { contentKey: { in: keys } }, _count: { _all: true } }),
  ]);
  const contentByKey = new Map(contents.map((content) => [content.key, content]));
  const publishedIds = contents.flatMap((content) => content.publishedRevisionId ? [content.publishedRevisionId] : []);
  const publishedRevisions = publishedIds.length > 0 ? await prisma.siteContentRevision.findMany({ where: { id: { in: publishedIds } }, select: { id: true, contentKey: true, version: true, updatedAt: true } }) : [];
  const draftByKey = new Map(latestDrafts.map((revision) => [revision.contentKey, revision]));
  const publishedByKey = new Map(publishedRevisions.map((revision) => [revision.contentKey, revision]));
  const countByKey = new Map(revisionCounts.map((row) => [row.contentKey, row._count._all]));

  return siteContentRegistry.map((definition) => {
    const content = contentByKey.get(definition.key);
    const latestDraft = draftByKey.get(definition.key);
    const published = publishedByKey.get(definition.key);
    return {
      definition,
      latestDraft: latestDraft ? { id: latestDraft.id, version: latestDraft.version, updatedAt: latestDraft.updatedAt.toISOString() } : null,
      published: published ? { id: published.id, version: published.version, updatedAt: published.updatedAt.toISOString() } : null,
      publishedAt: content?.publishedAt?.toISOString() ?? null,
      revisionCount: countByKey.get(definition.key) ?? 0,
    };
  });
}

export async function getAdminContentEditor(key: SiteContentDocumentKey, revisionId?: string) {
  const [publishedDocument, revisions] = await Promise.all([
    getPublishedSiteContentDocument(key),
    prisma.siteContentRevision.findMany({ where: { contentKey: key }, orderBy: [{ version: "desc" }], take: 30, select: revisionSelect }),
  ]);
  const views = revisions.map(toView);
  const selected = (revisionId ? views.find((revision) => revision.id === revisionId) : undefined)
    ?? views.find((revision) => revision.status === "DRAFT")
    ?? views.find((revision) => revision.status === "PUBLISHED")
    ?? null;
  const published = views.find((revision) => revision.id === publishedDocument.publishedRevisionId)
    ?? views.find((revision) => revision.status === "PUBLISHED")
    ?? null;
  return { definition: getSiteContentDefinition(key), publishedDocument, revisions: views, selected, published };
}

export async function nextContentRevisionVersion(transaction: Prisma.TransactionClient, contentKey: string): Promise<number> {
  const latest = await transaction.siteContentRevision.aggregate({ where: { contentKey }, _max: { version: true } });
  return (latest._max.version ?? 0) + 1;
}

export async function createRestoredDraft(input: { contentKey: SiteContentDocumentKey; revisionId: string; actorHash: string | null }) {
  return prisma.$transaction(async (transaction) => {
    const source = await transaction.siteContentRevision.findFirst({ where: { id: input.revisionId, contentKey: input.contentKey }, select: revisionSelect });
    if (!source) return null;
    const version = await nextContentRevisionVersion(transaction, input.contentKey);
    return transaction.siteContentRevision.create({
      data: {
        contentKey: input.contentKey, version, status: SiteContentRevisionStatus.DRAFT, payload: source.payload as Prisma.InputJsonValue,
        imageObjectKey: source.imageObjectKey, imageSmallObjectKey: source.imageSmallObjectKey,
        imageSmallWidth: source.imageSmallWidth, imageSmallHeight: source.imageSmallHeight, imageSmallSizeBytes: source.imageSmallSizeBytes,
        imageMediumObjectKey: source.imageMediumObjectKey,
        imageMediumWidth: source.imageMediumWidth, imageMediumHeight: source.imageMediumHeight, imageMediumSizeBytes: source.imageMediumSizeBytes,
        imageStorageArea: source.imageStorageArea, imageAlt: source.imageAlt,
        imageFocalX: source.imageFocalX, imageFocalY: source.imageFocalY,
        restoredFromRevisionId: source.id, createdByActorHash: input.actorHash,
      },
      select: { id: true, version: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function contentImageArea(value: "PUBLIC" | "PRIVATE" | undefined): StorageArea {
  return value === "PUBLIC" ? StorageArea.PUBLIC : StorageArea.PRIVATE;
}
