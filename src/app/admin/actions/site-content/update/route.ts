import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  getSiteContentDefaults,
  siteContentDefaults,
  type SiteContentKey,
} from "@/server/services/site-content";
import { deleteObjectByKey } from "@/server/services/storage";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { prepareSiteContentImageVariants } from "@/server/services/image-variants";
import { invalidateSiteContentCache } from "@/server/services/public-cache";
import { isAdminContentPhase3Enabled } from "@/server/services/admin-content-phase3";
import { sanitizeSameOriginPath, verifyMutationProtection } from "@/server/security/request-protection";
import {
  attemptStorageDeletions,
  enqueueStorageDeletions,
  type StorageDeletionTarget,
} from "@/server/services/storage-deletions";
import {
  MAX_SITE_CONTENT_IMAGE_SIZE_BYTES,
  sanitizeFilename,
  validateImageFileSignature,
  validateImageUploadMetadata,
} from "@/server/security/upload-validation";

export const runtime = "nodejs";
export const maxDuration = 300;

const allowedContentKeys = siteContentDefaults.map((content) => content.key) as [SiteContentKey, ...SiteContentKey[]];

const updateSiteContentSchema = z.object({
  key: z.enum(allowedContentKeys),
  title: z.string().trim().max(220).optional(),
  subtitle: z.string().trim().max(220).optional(),
  body: z.string().trim().max(3000).optional(),
  ctaTitle: z.string().trim().max(220).optional(),
  ctaBody: z.string().trim().max(3000).optional(),
  imageAlt: z.string().trim().max(220).optional(),
  clearImage: z.boolean(),
  returnTo: z.string().trim().max(500).optional(),
});

function redirectToEditor(request: Request, query: string, returnTo?: string): NextResponse {
  const candidate = sanitizeSameOriginPath(returnTo, "/admin/pages", request.url);
  const safePath = candidate.startsWith("/admin/pages") ? candidate : "/admin/pages";
  const url = new URL(safePath, request.url);
  const queryParams = new URLSearchParams(query);
  queryParams.forEach((value, key) => url.searchParams.set(key, value));
  return NextResponse.redirect(url, 303);
}

type PreparedContentImage = {
  objectKey: string;
  small: { objectKey: string; width: number; height: number; sizeBytes: bigint };
  medium: { objectKey: string; width: number; height: number; sizeBytes: bigint };
};

async function uploadContentImage(key: SiteContentKey, file: File): Promise<PreparedContentImage> {
  const metadataValidationError = validateImageUploadMetadata({
    filename: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    maxSizeBytes: MAX_SITE_CONTENT_IMAGE_SIZE_BYTES,
  });

  if (metadataValidationError) {
    throw new Error(metadataValidationError);
  }

  const safeFilename = sanitizeFilename(file.name) || "image.jpg";
  const objectKey = `site-content/${key.replace(/\./g, "/")}/${Date.now()}-${safeFilename}`;
  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);
  const signatureValidationError = validateImageFileSignature(fileBuffer, file.type);

  if (signatureValidationError) {
    throw new Error(signatureValidationError);
  }

  const variants = await prepareSiteContentImageVariants(fileBuffer, objectKey);

  // The generated medium derivative is the canonical public image. The source
  // upload is never retained or published, avoiding EXIF and original fallback.
  return { objectKey: variants.medium.objectKey, ...variants };
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (!env.DATABASE_URL) {
    return redirectToEditor(request, "error=database_not_configured");
  }

  if (isAdminContentPhase3Enabled()) {
    return redirectToEditor(request, "error=content_phase3_requires_revision_workflow");
  }

  let uploadedImageObjectKey: string | undefined;
  let preparedImage: PreparedContentImage | undefined;
  let contentPersisted = false;
  let returnTo: string | undefined;

  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));

    if (securityError) {
      return securityError;
    }

    const parsed = updateSiteContentSchema.parse({
      key: formData.get("key"),
      title: String(formData.get("title") ?? "").trim() || undefined,
      subtitle: String(formData.get("subtitle") ?? "").trim() || undefined,
      body: String(formData.get("body") ?? "").trim() || undefined,
      ctaTitle: String(formData.get("ctaTitle") ?? "").trim() || undefined,
      ctaBody: String(formData.get("ctaBody") ?? "").trim() || undefined,
      imageAlt: String(formData.get("imageAlt") ?? "").trim() || undefined,
      clearImage: String(formData.get("clearImage") ?? "") === "on",
      returnTo: String(formData.get("returnTo") ?? "").trim() || undefined,
    });
    returnTo = parsed.returnTo;
    const defaults = getSiteContentDefaults(parsed.key);
    const uploadedImage = formData.get("imageFile");
    preparedImage =
      uploadedImage instanceof File && uploadedImage.size > 0
        ? await uploadContentImage(parsed.key, uploadedImage)
        : undefined;
    uploadedImageObjectKey = preparedImage?.objectKey;

    const currentContent = await prisma.siteContent.findUnique({
      where: { key: parsed.key },
      select: {
        imageObjectKey: true,
        imageSmallObjectKey: true,
        imageMediumObjectKey: true,
      },
    });
    const replacesImage = parsed.clearImage || Boolean(uploadedImageObjectKey);
    const deletionTargets: StorageDeletionTarget[] = replacesImage
      ? [
          currentContent?.imageObjectKey,
          currentContent?.imageSmallObjectKey,
          currentContent?.imageMediumObjectKey,
        ]
          .filter((objectKey): objectKey is string => Boolean(objectKey) && objectKey !== uploadedImageObjectKey)
          .map((objectKey) => ({ area: "PUBLIC", objectKey }))
      : [];

    await prisma.$transaction(async (transaction) => {
      await enqueueStorageDeletions(transaction, deletionTargets);
      await transaction.siteContent.upsert({
        where: { key: parsed.key },
        create: {
          key: parsed.key,
          title: parsed.title ?? defaults.title,
          subtitle: parsed.subtitle ?? defaults.subtitle,
          body: parsed.body ?? defaults.body,
          ctaTitle: parsed.ctaTitle ?? defaults.ctaTitle,
          ctaBody: parsed.ctaBody ?? defaults.ctaBody,
          imageAlt: parsed.imageAlt ?? defaults.imageAlt,
          imageObjectKey: uploadedImageObjectKey,
          imageSmallObjectKey: preparedImage?.small.objectKey ?? null,
          imageSmallWidth: preparedImage?.small.width ?? null,
          imageSmallHeight: preparedImage?.small.height ?? null,
          imageSmallSizeBytes: preparedImage?.small.sizeBytes ?? null,
          imageMediumObjectKey: preparedImage?.medium.objectKey ?? null,
          imageMediumWidth: preparedImage?.medium.width ?? null,
          imageMediumHeight: preparedImage?.medium.height ?? null,
          imageMediumSizeBytes: preparedImage?.medium.sizeBytes ?? null,
        },
        update: {
          title: parsed.title ?? defaults.title,
          subtitle: parsed.subtitle ?? defaults.subtitle,
          body: parsed.body ?? defaults.body,
          ctaTitle: parsed.ctaTitle ?? defaults.ctaTitle,
          ctaBody: parsed.ctaBody ?? defaults.ctaBody,
          imageAlt: parsed.imageAlt ?? defaults.imageAlt,
          ...(replacesImage
            ? {
                imageObjectKey: uploadedImageObjectKey ?? null,
                imageSmallObjectKey: preparedImage?.small.objectKey ?? null,
                imageSmallWidth: preparedImage?.small.width ?? null,
                imageSmallHeight: preparedImage?.small.height ?? null,
                imageSmallSizeBytes: preparedImage?.small.sizeBytes ?? null,
                imageMediumObjectKey: preparedImage?.medium.objectKey ?? null,
                imageMediumWidth: preparedImage?.medium.width ?? null,
                imageMediumHeight: preparedImage?.medium.height ?? null,
                imageMediumSizeBytes: preparedImage?.medium.sizeBytes ?? null,
              }
            : {}),
        },
        select: { key: true },
      });
    });
    contentPersisted = true;
    await attemptStorageDeletions(deletionTargets);
    invalidateSiteContentCache();

    return redirectToEditor(request, "notice=site_content_updated", returnTo);
  } catch (error) {
    if (preparedImage && !contentPersisted) {
      await Promise.allSettled([
        deleteObjectByKey(preparedImage.small.objectKey, "PUBLIC"),
        deleteObjectByKey(preparedImage.medium.objectKey, "PUBLIC"),
      ]);
    }

    if (error instanceof z.ZodError) {
      return redirectToEditor(request, "error=invalid_site_content_payload", returnTo);
    }

    const prismaError = error as { code?: unknown; meta?: unknown };
    console.error("Unable to update site content.", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: typeof prismaError?.code === "string" ? prismaError.code : undefined,
      meta: prismaError?.meta,
    });

    return redirectToEditor(request, "error=site_content_update_failed", returnTo);
  }
}
