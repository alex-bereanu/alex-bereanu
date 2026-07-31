import "server-only";

import { cookies } from "next/headers";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  getGalleryAccessCookieName,
  hashGalleryCapabilityToken,
  isGalleryCapabilityToken,
  verifyGalleryAccessToken,
} from "@/server/auth/gallery-access";

export type ResolvedGalleryAccess = {
  shareLinkId: string;
  galleryId: string;
  galleryTitle: string;
  capabilityHash: string;
  grantVersion: number;
  archiveObjectKey: string | null;
  archiveFilename: string | null;
};

const activeShareWhere = {
  isActive: true,
  tokenHash: { not: null },
  gallery: {
    isActive: true,
    visibility: "PRIVATE" as const,
  },
};
const PRIVATE_GALLERY_PAGE_SIZE = 40;

const privateGalleryAssetSelect = {
  id: true,
  originalFilename: true,
  smallStorageKey: true,
  smallWidth: true,
  smallHeight: true,
  mediumStorageKey: true,
  mediumWidth: true,
  mediumHeight: true,
  largeStorageKey: true,
  largeWidth: true,
  largeHeight: true,
  placeholderDataUrl: true,
  width: true,
  height: true,
} as const;

async function readGalleryGrant() {
  const token = (await cookies()).get(getGalleryAccessCookieName())?.value;
  return token ? verifyGalleryAccessToken(token) : null;
}

function isExpired(expiresAt: Date | null): boolean {
  return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
}

export async function getPrivateGalleryPageAccess(capabilityToken: string) {
  if (!env.DATABASE_URL || !isGalleryCapabilityToken(capabilityToken)) {
    return null;
  }

  const tokenHash = hashGalleryCapabilityToken(capabilityToken);
  const shareLink = await prisma.galleryShareLink.findFirst({
    where: {
      ...activeShareWhere,
      tokenHash,
    },
    select: {
      id: true,
      grantVersion: true,
      passwordHash: true,
      expiresAt: true,
      maxDownloads: true,
      downloadCount: true,
      gallery: {
        select: {
          id: true,
          title: true,
          description: true,
          archiveObjectKey: true,
          archiveStatus: true,
          _count: { select: { assets: { where: { status: "READY" } } } },
          assets: {
            where: { status: "READY" },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
            take: PRIVATE_GALLERY_PAGE_SIZE + 1,
            select: privateGalleryAssetSelect,
          },
        },
      },
    },
  });

  if (!shareLink || isExpired(shareLink.expiresAt)) {
    return null;
  }

  const grant = await readGalleryGrant();
  const isAuthorized = Boolean(
    grant &&
      grant.sub === shareLink.id &&
      grant.grantVersion === shareLink.grantVersion,
  );

  if (isAuthorized) {
    await prisma.galleryShareLink.updateMany({
      where: { id: shareLink.id, isActive: true },
      data: { lastAccessedAt: new Date() },
    });
  }

  return {
    ...shareLink,
    gallery: {
      ...shareLink.gallery,
      archiveObjectKey: shareLink.gallery.archiveStatus === "READY" ? shareLink.gallery.archiveObjectKey : null,
      assets: shareLink.gallery.assets.slice(0, PRIVATE_GALLERY_PAGE_SIZE),
      assetCount: shareLink.gallery._count.assets,
      nextCursor:
        shareLink.gallery.assets.length > PRIVATE_GALLERY_PAGE_SIZE
          ? shareLink.gallery.assets[PRIVATE_GALLERY_PAGE_SIZE - 1]?.id ?? null
          : null,
    },
    isAuthorized,
    requiresPassword: Boolean(shareLink.passwordHash),
  };
}

export async function getPrivateGalleryAssetPage(cursor: string) {
  if (!env.DATABASE_URL || !cursor) return { assets: [], nextCursor: null };
  const access = await resolveGalleryAccessFromCookie();
  if (!access) return null;

  const assets = await prisma.galleryAsset.findMany({
    where: { galleryId: access.galleryId, status: "READY" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    cursor: { id: cursor },
    skip: 1,
    take: PRIVATE_GALLERY_PAGE_SIZE + 1,
    select: privateGalleryAssetSelect,
  });
  const pageAssets = assets.slice(0, PRIVATE_GALLERY_PAGE_SIZE);

  return {
    assets: pageAssets,
    nextCursor:
      assets.length > PRIVATE_GALLERY_PAGE_SIZE
        ? pageAssets[PRIVATE_GALLERY_PAGE_SIZE - 1]?.id ?? null
        : null,
  };
}

export async function resolvePasswordlessGalleryCapability(capabilityToken: string) {
  if (!env.DATABASE_URL || !isGalleryCapabilityToken(capabilityToken)) {
    return null;
  }

  const shareLink = await prisma.galleryShareLink.findFirst({
    where: {
      ...activeShareWhere,
      tokenHash: hashGalleryCapabilityToken(capabilityToken),
      passwordHash: null,
    },
    select: {
      id: true,
      grantVersion: true,
      expiresAt: true,
    },
  });

  return shareLink && !isExpired(shareLink.expiresAt) ? shareLink : null;
}

export async function resolveGalleryAccessFromCookie(): Promise<ResolvedGalleryAccess | null> {
  if (!env.DATABASE_URL) {
    return null;
  }

  const grant = await readGalleryGrant();

  if (!grant) {
    return null;
  }

  const shareLink = await prisma.galleryShareLink.findFirst({
    where: {
      ...activeShareWhere,
      id: grant.sub,
      grantVersion: grant.grantVersion,
    },
    select: {
      id: true,
      tokenHash: true,
      grantVersion: true,
      expiresAt: true,
      gallery: {
        select: {
          id: true,
          title: true,
          archiveObjectKey: true,
          archiveFilename: true,
          archiveStatus: true,
        },
      },
    },
  });

  if (!shareLink?.tokenHash || isExpired(shareLink.expiresAt)) {
    return null;
  }

  return {
    shareLinkId: shareLink.id,
    galleryId: shareLink.gallery.id,
    galleryTitle: shareLink.gallery.title,
    capabilityHash: shareLink.tokenHash,
    grantVersion: shareLink.grantVersion,
    archiveObjectKey: shareLink.gallery.archiveStatus === "READY" ? shareLink.gallery.archiveObjectKey : null,
    archiveFilename: shareLink.gallery.archiveStatus === "READY" ? shareLink.gallery.archiveFilename : null,
  };
}

export function galleryCapabilityMatchesAccess(
  capabilityToken: string,
  access: ResolvedGalleryAccess,
): boolean {
  return (
    isGalleryCapabilityToken(capabilityToken) &&
    hashGalleryCapabilityToken(capabilityToken) === access.capabilityHash
  );
}

export async function recordGalleryShareLinkDownload(shareLinkId: string): Promise<boolean> {
  if (!env.DATABASE_URL) {
    return false;
  }

  const updatedRows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "GalleryShareLink" AS share
    SET
      "downloadCount" = "downloadCount" + 1,
      "lastAccessedAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE
      share."id" = ${shareLinkId}
      AND share."tokenHash" IS NOT NULL
      AND share."isActive" = true
      AND (share."expiresAt" IS NULL OR share."expiresAt" > CURRENT_TIMESTAMP)
      AND (share."maxDownloads" IS NULL OR share."downloadCount" < share."maxDownloads")
      AND EXISTS (
        SELECT 1
        FROM "Gallery" AS gallery
        WHERE gallery."id" = share."galleryId"
          AND gallery."isActive" = true
          AND gallery."visibility" = 'PRIVATE'
      )
    RETURNING share."id"
  `;

  return updatedRows.length > 0;
}
