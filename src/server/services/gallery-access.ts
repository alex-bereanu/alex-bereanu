import { cookies } from "next/headers";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { getGalleryAccessCookieName, verifyGalleryAccessToken } from "@/server/auth/gallery-access";

export type ResolvedGalleryAccess = {
  shareLinkId: string;
  galleryId: string;
  galleryTitle: string;
  slug: string;
  archiveObjectKey: string | null;
  archiveFilename: string | null;
};

export async function resolveGalleryAccessBySlug(slug: string): Promise<ResolvedGalleryAccess | null> {
  if (!env.DATABASE_URL) {
    return null;
  }

  const shareLink = await prisma.galleryShareLink.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      isActive: true,
      expiresAt: true,
      passwordHash: true,
      gallery: {
        select: {
          id: true,
          title: true,
          archiveObjectKey: true,
          archiveFilename: true,
        },
      },
    },
  });

  if (!shareLink || !shareLink.isActive) {
    return null;
  }

  if (shareLink.expiresAt && shareLink.expiresAt.getTime() < Date.now()) {
    return null;
  }

  if (shareLink.passwordHash) {
    const token = (await cookies()).get(getGalleryAccessCookieName())?.value;

    if (!token) {
      return null;
    }

    const isAllowed = await verifyGalleryAccessToken(token, slug);

    if (!isAllowed) {
      return null;
    }
  }

  return {
    shareLinkId: shareLink.id,
    galleryId: shareLink.gallery.id,
    galleryTitle: shareLink.gallery.title,
    slug: shareLink.slug,
    archiveObjectKey: shareLink.gallery.archiveObjectKey,
    archiveFilename: shareLink.gallery.archiveFilename,
  };
}

export async function recordGalleryShareLinkDownload(shareLinkId: string): Promise<boolean> {
  if (!env.DATABASE_URL) {
    return false;
  }

  const updatedRows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "GalleryShareLink"
    SET
      "downloadCount" = "downloadCount" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE
      "id" = ${shareLinkId}
      AND "isActive" = true
      AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
      AND ("maxDownloads" IS NULL OR "downloadCount" < "maxDownloads")
    RETURNING "id"
  `;

  return updatedRows.length > 0;
}
