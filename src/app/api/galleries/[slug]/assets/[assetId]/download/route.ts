import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { parseSingleByteRange } from "@/lib/http-byte-range";
import { emitOperationalEvent } from "@/server/observability/events";
import { isAdminClientDeliveryPhase4Enabled } from "@/server/services/admin-client-delivery-phase4";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import {
  parseClientDeliveryIntent,
  recordCompletedGalleryAssetDelivery,
} from "@/server/services/client-delivery";
import {
  buildStorageContentDisposition,
  createSignedDownloadUrl,
  getObjectStream,
  headObject,
} from "@/server/services/storage";
import {
  galleryCapabilityMatchesAccess,
  recordGalleryShareLinkDownload,
  resolveGalleryAccessFromCookie,
} from "@/server/services/gallery-access";

type RouteProps = {
  params: Promise<{ slug: string; assetId: string }>;
};

function privateOriginalHeaders(input?: {
  contentLength?: number | null;
  contentRange?: string | null;
  contentType?: string | null;
  disposition?: string;
  etag?: string | null;
}): Headers {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store, max-age=0",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    Vary: "Cookie, Range",
  });
  if (input?.contentLength !== null && input?.contentLength !== undefined) headers.set("Content-Length", String(input.contentLength));
  if (input?.contentRange) headers.set("Content-Range", input.contentRange);
  if (input?.contentType) headers.set("Content-Type", input.contentType);
  if (input?.disposition) headers.set("Content-Disposition", input.disposition);
  if (input?.etag) headers.set("ETag", input.etag);
  return headers;
}

export async function GET(request: Request, { params }: RouteProps): Promise<NextResponse | Response> {
  const { slug, assetId } = await params;
  const access = await resolveGalleryAccessFromCookie();

  if (!access || !galleryCapabilityMatchesAccess(slug, access)) {
    return NextResponse.json({ error: "Gallery not accessible." }, { status: 404 });
  }

  const asset = await prisma.galleryAsset.findFirst({
    where: {
      id: assetId,
      galleryId: access.galleryId,
      status: "READY",
      ...(isAdminGalleryPhase2Enabled() ? { deletedAt: null } : {}),
    },
    select: {
      storageKey: true,
      sourceStorageArea: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      contentHash: true,
    },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }

  if (!isAdminClientDeliveryPhase4Enabled()) {
    const downloadAllowed = await recordGalleryShareLinkDownload(access.shareLinkId);

    if (!downloadAllowed) {
      return NextResponse.json({ error: "Download limit reached for this gallery link." }, { status: 403 });
    }

    const signedUrl = await createSignedDownloadUrl({
      area: asset.sourceStorageArea,
      objectKey: asset.storageKey,
      downloadFilename: asset.originalFilename,
      expiresInSeconds: 60 * 2,
    });

    return NextResponse.redirect(signedUrl, 302);
  }

  const range = parseSingleByteRange(request.headers.get("range"), asset.sizeBytes);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: new Headers({ ...Object.fromEntries(privateOriginalHeaders()), "Content-Range": `bytes */${asset.sizeBytes}` }),
    });
  }

  const intent = parseClientDeliveryIntent(new URL(request.url).searchParams.get("intent"));

  try {
    const object = await getObjectStream(asset.storageKey, asset.sourceStorageArea, { range: range.value });
    const sourceMetadataMatches = Boolean(asset.contentHash && object.metadata["content-sha256"] === asset.contentHash);
    const sourceSizeMatches = range.value
      ? object.contentRange?.endsWith(`/${asset.sizeBytes}`) === true
      : object.contentLength !== null && BigInt(object.contentLength) === asset.sizeBytes;
    if (!sourceMetadataMatches || !sourceSizeMatches) {
      await object.body.cancel().catch(() => undefined);
      await emitOperationalEvent({ kind: "client-delivery", severity: "error", data: { routeGroup: "/api/galleries/[private]/assets/[asset]/download", outcome: "integrity_mismatch", intent } });
      return new Response(null, { status: 409, headers: privateOriginalHeaders() });
    }
    const trackedBody = range.complete
      ? object.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
          async flush() {
            await recordCompletedGalleryAssetDelivery({
              galleryId: access.galleryId,
              assetId,
              shareLinkId: access.shareLinkId,
              intent,
              sourceContentHash: asset.contentHash,
              sourceSizeBytes: asset.sizeBytes,
            }).catch(() => undefined);
          },
        }))
      : object.body;

    return new Response(trackedBody, {
      status: range.value ? 206 : 200,
      headers: privateOriginalHeaders({
        contentLength: object.contentLength,
        contentRange: object.contentRange,
        contentType: object.contentType ?? asset.mimeType,
        disposition: buildStorageContentDisposition(asset.originalFilename, intent === "view" ? "inline" : "attachment"),
        etag: object.etag,
      }),
    });
  } catch {
    await emitOperationalEvent({ kind: "client-delivery", severity: "warning", data: { routeGroup: "/api/galleries/[private]/assets/[asset]/download", outcome: "storage_error", intent } });
    return new Response(null, { status: 404, headers: privateOriginalHeaders() });
  }
}

export async function HEAD(_request: Request, { params }: RouteProps): Promise<Response> {
  const { slug, assetId } = await params;
  const access = await resolveGalleryAccessFromCookie();
  if (!access || !galleryCapabilityMatchesAccess(slug, access)) return new Response(null, { status: 404, headers: privateOriginalHeaders() });

  const asset = await prisma.galleryAsset.findFirst({
    where: { id: assetId, galleryId: access.galleryId, status: "READY", ...(isAdminGalleryPhase2Enabled() ? { deletedAt: null } : {}) },
    select: { storageKey: true, sourceStorageArea: true, originalFilename: true, mimeType: true, sizeBytes: true, contentHash: true },
  });
  if (!asset) return new Response(null, { status: 404, headers: privateOriginalHeaders() });

  if (!isAdminClientDeliveryPhase4Enabled()) {
    return new Response(null, { status: 405, headers: new Headers({ ...Object.fromEntries(privateOriginalHeaders()), Allow: "GET" }) });
  }

  try {
    const object = await headObject(asset.storageKey, asset.sourceStorageArea);
    const valid = Boolean(
      asset.contentHash &&
      object.metadata["content-sha256"] === asset.contentHash &&
      object.contentLength !== null &&
      BigInt(object.contentLength) === asset.sizeBytes,
    );
    if (!valid) return new Response(null, { status: 409, headers: privateOriginalHeaders() });
    return new Response(null, {
      status: 200,
      headers: privateOriginalHeaders({
        contentLength: object.contentLength,
        contentType: object.contentType ?? asset.mimeType,
        disposition: buildStorageContentDisposition(asset.originalFilename, "attachment"),
        etag: object.etag,
      }),
    });
  } catch {
    return new Response(null, { status: 404, headers: privateOriginalHeaders() });
  }
}
