import { Prisma, SiteContentRevisionStatus, StorageArea } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  getSiteContentDefinition,
  isSiteContentDocumentKey,
  normalizeSiteContentPayload,
  type SiteContentDocumentKey,
} from "@/lib/site-content-registry";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { sanitizeSameOriginPath, verifyMutationProtection } from "@/server/security/request-protection";
import { isAdminContentPhase3Enabled } from "@/server/services/admin-content-phase3";
import { preparePrivateSiteContentImageVariants } from "@/server/services/image-variants";
import { deleteObjectByKey } from "@/server/services/storage";
import { hashContentActor, nextContentRevisionVersion } from "@/server/services/site-content-revisions";
import {
  MAX_SITE_CONTENT_IMAGE_SIZE_BYTES,
  sanitizeFilename,
  validateImageFileSignature,
  validateImageUploadMetadata,
} from "@/server/security/upload-validation";

export const runtime = "nodejs";
export const maxDuration = 300;

const envelopeSchema = z.object({
  key: z.string().trim().min(1).max(120),
  baseRevisionId: z.string().trim().max(200).optional(),
  imageAlt: z.string().trim().max(220).optional(),
  focalX: z.union([z.number().min(0).max(1), z.null()]),
  focalY: z.union([z.number().min(0).max(1), z.null()]),
  clearImage: z.boolean(),
  returnTo: z.string().trim().max(500).optional(),
});

function editorRedirect(request: Request, key: string | undefined, query: string, returnTo?: string) {
  const fallback = key ? `/admin/pages/${encodeURIComponent(key)}` : "/admin/pages";
  const candidate = sanitizeSameOriginPath(returnTo, fallback, request.url);
  const safePath = candidate.startsWith("/admin/pages") ? candidate : fallback;
  const url = new URL(safePath, request.url);
  new URLSearchParams(query).forEach((value, name) => url.searchParams.set(name, value));
  return NextResponse.redirect(url, 303);
}

function optionalCoordinate(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  return raw ? Number(raw) : null;
}

async function prepareDraftImage(key: SiteContentDocumentKey, file: File) {
  const metadataError = validateImageUploadMetadata({ filename: file.name, contentType: file.type, sizeBytes: file.size, maxSizeBytes: MAX_SITE_CONTENT_IMAGE_SIZE_BYTES });
  if (metadataError) throw new Error(metadataError);
  const buffer = Buffer.from(await file.arrayBuffer());
  const signatureError = validateImageFileSignature(buffer, file.type);
  if (signatureError) throw new Error(signatureError);
  const filename = sanitizeFilename(file.name) || "image.jpg";
  const seed = `site-content-drafts/${key.replace(/\./g, "/")}/${Date.now()}-${filename}`;
  const variants = await preparePrivateSiteContentImageVariants(buffer, seed);
  return {
    imageObjectKey: variants.medium.objectKey,
    imageSmallObjectKey: variants.small.objectKey, imageSmallWidth: variants.small.width, imageSmallHeight: variants.small.height, imageSmallSizeBytes: variants.small.sizeBytes,
    imageMediumObjectKey: variants.medium.objectKey, imageMediumWidth: variants.medium.width, imageMediumHeight: variants.medium.height, imageMediumSizeBytes: variants.medium.sizeBytes,
    imageStorageArea: StorageArea.PRIVATE,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;
  if (!env.DATABASE_URL) return editorRedirect(request, undefined, "error=database_not_configured");
  if (!isAdminContentPhase3Enabled()) return editorRedirect(request, undefined, "error=content_phase3_not_enabled");

  let key: SiteContentDocumentKey | undefined;
  let returnTo: string | undefined;
  let uploaded: Awaited<ReturnType<typeof prepareDraftImage>> | undefined;
  let persisted = false;
  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));
    if (securityError) return securityError;
    const rawKey = String(formData.get("key") ?? "").trim();
    if (!isSiteContentDocumentKey(rawKey)) throw new Error("invalid_content_key");
    key = rawKey;
    const definition = getSiteContentDefinition(key);
    const parsed = envelopeSchema.parse({
      key,
      baseRevisionId: String(formData.get("baseRevisionId") ?? "").trim() || undefined,
      imageAlt: String(formData.get("imageAlt") ?? "").trim() || undefined,
      focalX: optionalCoordinate(formData.get("focalX")), focalY: optionalCoordinate(formData.get("focalY")),
      clearImage: String(formData.get("clearImage") ?? "") === "on",
      returnTo: String(formData.get("returnTo") ?? "").trim() || undefined,
    });
    returnTo = parsed.returnTo;
    const payload = normalizeSiteContentPayload(key, Object.fromEntries(definition.fields.map((field) => [field.name, String(formData.get(field.name) ?? "")])));
    const file = formData.get("imageFile");
    if (file instanceof File && file.size > 0) uploaded = await prepareDraftImage(key, file);

    const [baseRevision, live] = await Promise.all([
      parsed.baseRevisionId ? prisma.siteContentRevision.findFirst({ where: { id: parsed.baseRevisionId, contentKey: key } }) : Promise.resolve(null),
      prisma.siteContent.findUnique({ where: { key } }),
    ]);
    const retainedImage = parsed.clearImage ? {} : uploaded ?? (baseRevision ? {
      imageObjectKey: baseRevision.imageObjectKey, imageSmallObjectKey: baseRevision.imageSmallObjectKey,
      imageSmallWidth: baseRevision.imageSmallWidth, imageSmallHeight: baseRevision.imageSmallHeight, imageSmallSizeBytes: baseRevision.imageSmallSizeBytes,
      imageMediumObjectKey: baseRevision.imageMediumObjectKey, imageMediumWidth: baseRevision.imageMediumWidth, imageMediumHeight: baseRevision.imageMediumHeight, imageMediumSizeBytes: baseRevision.imageMediumSizeBytes,
      imageStorageArea: baseRevision.imageStorageArea,
    } : {
      imageObjectKey: live?.imageObjectKey, imageSmallObjectKey: live?.imageSmallObjectKey,
      imageSmallWidth: live?.imageSmallWidth, imageSmallHeight: live?.imageSmallHeight, imageSmallSizeBytes: live?.imageSmallSizeBytes,
      imageMediumObjectKey: live?.imageMediumObjectKey, imageMediumWidth: live?.imageMediumWidth, imageMediumHeight: live?.imageMediumHeight, imageMediumSizeBytes: live?.imageMediumSizeBytes,
      imageStorageArea: live?.imageObjectKey || live?.imageSmallObjectKey || live?.imageMediumObjectKey ? StorageArea.PUBLIC : null,
    });
    const actorHash = hashContentActor(getClientIp(request));
    const revision = await prisma.$transaction(async (transaction) => {
      await transaction.siteContent.upsert({
        where: { key: key! },
        create: { key: key! },
        update: {},
        select: { key: true },
      });
      const version = await nextContentRevisionVersion(transaction, key!);
      return transaction.siteContentRevision.create({
        data: {
          contentKey: key!, version, status: SiteContentRevisionStatus.DRAFT, payload: payload as Prisma.InputJsonValue,
          ...retainedImage, imageAlt: definition.supportsImage ? parsed.imageAlt ?? "" : null,
          imageFocalX: definition.supportsImage ? parsed.focalX : null, imageFocalY: definition.supportsImage ? parsed.focalY : null,
          createdByActorHash: actorHash,
        },
        select: { id: true, version: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    persisted = true;
    await recordSecurityAuditEvent({ eventType: "site.content.draft.save", outcome: "SUCCESS", clientIp: getClientIp(request), resourceType: "site_content", resourceId: key, metadata: { revision_id: revision.id, version: revision.version } });
    return editorRedirect(request, key, `notice=content_draft_saved&revision=${encodeURIComponent(revision.id)}`, returnTo);
  } catch (error) {
    if (uploaded && !persisted) await Promise.allSettled([deleteObjectByKey(uploaded.imageSmallObjectKey, "PRIVATE"), deleteObjectByKey(uploaded.imageMediumObjectKey, "PRIVATE")]);
    await recordSecurityAuditEvent({ eventType: "site.content.draft.save", outcome: "ERROR", clientIp: getClientIp(request), resourceType: "site_content", resourceId: key });
    return editorRedirect(request, key, `error=${error instanceof z.ZodError ? "invalid_content_draft" : "content_draft_save_failed"}`, returnTo);
  }
}
