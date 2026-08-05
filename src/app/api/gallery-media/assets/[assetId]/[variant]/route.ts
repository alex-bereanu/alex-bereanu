import { prisma } from "@/lib/db";
import { resolveGalleryAccessFromCookie } from "@/server/services/gallery-access";
import { getObjectStream } from "@/server/services/storage";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";

type RouteProps = {
  params: Promise<{ assetId: string; variant: string }>;
};

export const dynamic = "force-dynamic";

function privateMediaHeaders(input?: {
  contentLength?: number | null;
  etag?: string | null;
}): Headers {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": "inline",
    "Content-Type": "image/webp",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    Vary: "Cookie",
  });

  if (input?.contentLength !== null && input?.contentLength !== undefined) {
    headers.set("Content-Length", String(input.contentLength));
  }

  if (input?.etag) {
    headers.set("ETag", input.etag);
  }

  return headers;
}

function notFoundResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: privateMediaHeaders(),
  });
}

export async function GET(_: Request, { params }: RouteProps): Promise<Response> {
  const { assetId, variant } = await params;

  if (variant !== "small" && variant !== "medium" && variant !== "large") {
    return notFoundResponse();
  }

  const access = await resolveGalleryAccessFromCookie();

  if (!access) {
    return notFoundResponse();
  }

  const asset = await prisma.galleryAsset.findFirst({
    where: {
      id: assetId,
      galleryId: access.galleryId,
      status: "READY",
      ...(isAdminGalleryPhase2Enabled() ? { deletedAt: null } : {}),
    },
    select: {
      smallStorageKey: true,
      mediumStorageKey: true,
      largeStorageKey: true,
    },
  });
  const objectKey =
    variant === "small"
      ? asset?.smallStorageKey
      : variant === "medium"
        ? asset?.mediumStorageKey
        : asset?.largeStorageKey;

  if (!objectKey) {
    return notFoundResponse();
  }

  try {
    const object = await getObjectStream(objectKey, "PRIVATE");

    return new Response(object.body, {
      status: 200,
      headers: privateMediaHeaders({
        contentLength: object.contentLength,
        etag: object.etag,
      }),
    });
  } catch {
    return notFoundResponse();
  }
}
