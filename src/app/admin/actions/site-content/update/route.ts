import { after, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  getSiteContentDefaults,
  siteContentDefaults,
  type SiteContentKey,
} from "@/server/services/site-content";
import { uploadObject } from "@/server/services/storage";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { processSiteContentImageVariants } from "@/server/services/image-variants";
import { verifyMutationProtection } from "@/server/security/request-protection";
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
});

function redirectToAdmin(request: Request, query: string): NextResponse {
  const url = new URL(`/admin?${query}#site-content`, request.url);
  return NextResponse.redirect(url, 303);
}

async function uploadContentImage(key: SiteContentKey, file: File): Promise<string> {
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

  await uploadObject({
    objectKey,
    contentType: file.type || "application/octet-stream",
    body: fileBuffer,
  });

  return objectKey;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (!env.DATABASE_URL) {
    return redirectToAdmin(request, "error=database_not_configured");
  }

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
    });
    const defaults = getSiteContentDefaults(parsed.key);
    const uploadedImage = formData.get("imageFile");
    const uploadedImageObjectKey =
      uploadedImage instanceof File && uploadedImage.size > 0
        ? await uploadContentImage(parsed.key, uploadedImage)
        : undefined;

    await prisma.siteContent.upsert({
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
        imageSmallObjectKey: null,
        imageSmallWidth: null,
        imageSmallHeight: null,
        imageSmallSizeBytes: null,
        imageMediumObjectKey: null,
        imageMediumWidth: null,
        imageMediumHeight: null,
        imageMediumSizeBytes: null,
      },
      update: {
        title: parsed.title ?? defaults.title,
        subtitle: parsed.subtitle ?? defaults.subtitle,
        body: parsed.body ?? defaults.body,
        ctaTitle: parsed.ctaTitle ?? defaults.ctaTitle,
        ctaBody: parsed.ctaBody ?? defaults.ctaBody,
        imageAlt: parsed.imageAlt ?? defaults.imageAlt,
        ...(parsed.clearImage || uploadedImageObjectKey
          ? {
              imageObjectKey: uploadedImageObjectKey ?? null,
              imageSmallObjectKey: null,
              imageSmallWidth: null,
              imageSmallHeight: null,
              imageSmallSizeBytes: null,
              imageMediumObjectKey: null,
              imageMediumWidth: null,
              imageMediumHeight: null,
              imageMediumSizeBytes: null,
            }
          : {}),
      },
    });

    if (uploadedImageObjectKey) {
      after(async () => {
        await processSiteContentImageVariants(parsed.key, uploadedImageObjectKey);
      });
    }

    return redirectToAdmin(request, "notice=site_content_updated");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToAdmin(request, "error=invalid_site_content_payload");
    }

    return redirectToAdmin(request, "error=site_content_update_failed");
  }
}
