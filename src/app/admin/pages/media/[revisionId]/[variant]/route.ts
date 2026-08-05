import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { getObjectStream } from "@/server/services/storage";

type RouteProps = { params: Promise<{ revisionId: string; variant: string }> };
export const dynamic = "force-dynamic";

function responseHeaders(input?: { contentLength?: number | null; etag?: string | null }) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": "inline", "Content-Type": "image/webp",
    "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive", Vary: "Cookie",
  });
  if (input?.contentLength != null) headers.set("Content-Length", String(input.contentLength));
  if (input?.etag) headers.set("ETag", input.etag);
  return headers;
}

function notFound() { return new Response(null, { status: 404, headers: responseHeaders() }); }

export async function GET(request: Request, { params }: RouteProps): Promise<Response> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) return authRedirect;
  const { revisionId, variant } = await params;
  if (variant !== "small" && variant !== "medium") return notFound();
  const revision = await prisma.siteContentRevision.findUnique({
    where: { id: revisionId },
    select: { imageSmallObjectKey: true, imageMediumObjectKey: true, imageStorageArea: true },
  });
  const objectKey = variant === "small" ? revision?.imageSmallObjectKey : revision?.imageMediumObjectKey;
  if (!revision?.imageStorageArea || !objectKey) return notFound();
  try {
    const object = await getObjectStream(objectKey, revision.imageStorageArea);
    return new Response(object.body, { status: 200, headers: responseHeaders({ contentLength: object.contentLength, etag: object.etag }) });
  } catch {
    return notFound();
  }
}
