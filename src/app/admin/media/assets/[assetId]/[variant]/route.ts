import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { getObjectStream, getStorageAreaForGalleryVisibility } from "@/server/services/storage";

type RouteProps = { params: Promise<{ assetId: string; variant: string }> };
export const dynamic = "force-dynamic";

function headers(input?: { contentLength?: number | null; etag?: string | null }): Headers {
  const result = new Headers({
    "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": "inline", "Content-Type": "image/webp",
    "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive", Vary: "Cookie",
  });
  if (input?.contentLength != null) result.set("Content-Length", String(input.contentLength));
  if (input?.etag) result.set("ETag", input.etag);
  return result;
}

function notFound(): Response { return new Response(null, { status: 404, headers: headers() }); }

export async function GET(request: Request, { params }: RouteProps): Promise<Response> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;
  const { assetId, variant } = await params;
  if (!(["small", "medium", "large"] as const).includes(variant as "small" | "medium" | "large")) return notFound();

  const asset = await prisma.galleryAsset.findFirst({
    where: { id: assetId, status: "READY" },
    select: { smallStorageKey: true, mediumStorageKey: true, largeStorageKey: true, gallery: { select: { visibility: true } } },
  });
  const objectKey = variant === "small" ? asset?.smallStorageKey : variant === "medium" ? asset?.mediumStorageKey : asset?.largeStorageKey;
  if (!asset || !objectKey) return notFound();
  try {
    const object = await getObjectStream(objectKey, getStorageAreaForGalleryVisibility(asset.gallery.visibility));
    return new Response(object.body, { status: 200, headers: headers({ contentLength: object.contentLength, etag: object.etag }) });
  } catch {
    return notFound();
  }
}
