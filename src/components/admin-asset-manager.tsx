"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AdminAssetUpload } from "@/components/admin-asset-upload";

type AssetListItem = {
  id: string;
  originalFilename: string;
  previewUrl?: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED" | "DELETING";
  failureReason: string | null;
};

type AdminAssetManagerProps = {
  galleryId: string;
  assets: AssetListItem[];
  csrfToken: string;
  initialNextCursor?: string | null;
  totalCount?: number;
};

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function moveAsset(assets: AssetListItem[], draggedId: string, targetId: string): AssetListItem[] {
  const draggedIndex = assets.findIndex((asset) => asset.id === draggedId);
  const targetIndex = assets.findIndex((asset) => asset.id === targetId);

  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
    return assets;
  }

  const next = [...assets];
  const [draggedAsset] = next.splice(draggedIndex, 1);

  if (!draggedAsset) {
    return assets;
  }

  next.splice(targetIndex, 0, draggedAsset);
  return next;
}

function moveAssetByOffset(assets: AssetListItem[], assetId: string, offset: -1 | 1): AssetListItem[] {
  const index = assets.findIndex((asset) => asset.id === assetId);
  const targetIndex = index + offset;

  if (index < 0 || targetIndex < 0 || targetIndex >= assets.length) return assets;

  const next = [...assets];
  [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
  return next;
}

export function AdminAssetManager({
  galleryId,
  assets: initialAssets,
  csrfToken,
  initialNextCursor = null,
  totalCount,
}: AdminAssetManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [assets, setAssets] = useState(initialAssets);
  const [persistedOrder, setPersistedOrder] = useState(initialAssets.map((asset) => asset.id));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const currentOrder = useMemo(() => assets.map((asset) => asset.id), [assets]);
  const isOrderDirty = useMemo(() => !arraysEqual(currentOrder, persistedOrder), [currentOrder, persistedOrder]);

  async function saveOrder() {
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/admin/actions/galleries/assets-reorder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          galleryId,
          assetIds: currentOrder,
          csrfToken,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to save order");
      }

      setPersistedOrder(currentOrder);
      setMessage("Asset order saved.");
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to save asset order.");
    }
  }

  async function deleteAsset(assetId: string) {
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/admin/actions/galleries/assets-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          galleryId,
          assetId,
          csrfToken,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to delete asset");
      }

      setAssets((previous) => previous.filter((asset) => asset.id !== assetId));
      setPersistedOrder((previous) => previous.filter((id) => id !== assetId));
      setMessage("Asset removed; storage cleanup is recorded and will retry if needed.");
      setDeleteCandidateId(null);
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to delete asset.");
    }
  }

  async function loadMoreAssets() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);

    try {
      const response = await fetch(
        `/admin/actions/galleries/assets-page?galleryId=${encodeURIComponent(galleryId)}&cursor=${encodeURIComponent(nextCursor)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as { assets?: AssetListItem[]; nextCursor?: string | null };
      if (!response.ok || !Array.isArray(payload.assets)) throw new Error("invalid_asset_page");

      setAssets((current) => {
        const knownIds = new Set(current.map((asset) => asset.id));
        return [...current, ...payload.assets!.filter((asset) => !knownIds.has(asset.id))];
      });
      setPersistedOrder((current) => [
        ...current,
        ...payload.assets!.map((asset) => asset.id).filter((id) => !current.includes(id)),
      ]);
      setNextCursor(payload.nextCursor ?? null);
    } catch {
      setError("Failed to load more assets.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">Assets</h3>
      <p className="mt-1 text-xs text-neutral-600">Use Move Up/Down on touch or keyboard, or drag with a pointer. Save when finished.</p>

      <AdminAssetUpload galleryId={galleryId} csrfToken={csrfToken} />

      {assets.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="min-h-11 rounded border bg-white px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={saveOrder}
              disabled={!isOrderDirty || isPending}
            >
              Save order
            </button>
            {message ? <span className="text-xs text-emerald-700" aria-live="polite">{message}</span> : null}
            {error ? <span className="text-xs text-red-700" role="alert">{error}</span> : null}
          </div>

          {assets.map((asset, assetIndex) => {
            return (
              <div
                key={asset.id}
                className="grid gap-3 rounded border bg-white p-3 text-xs sm:grid-cols-[1fr_auto] sm:items-center"
                tabIndex={0}
                aria-label={`${asset.originalFilename}. Use Alt plus Arrow Up or Arrow Down to reorder.`}
                draggable
                onDragStart={() => setDraggedId(asset.id)}
                onDragEnd={() => setDraggedId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();

                  if (!draggedId) {
                    return;
                  }

                  setAssets((previous) => moveAsset(previous, draggedId, asset.id));
                  setDraggedId(null);
                }}
                onKeyDown={(event) => {
                  if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                  event.preventDefault();
                  setAssets((previous) => moveAssetByOffset(previous, asset.id, event.key === "ArrowUp" ? -1 : 1));
                }}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{asset.originalFilename}</p>
                  <p className="text-neutral-600">
                    {asset.mimeType}
                    {asset.width && asset.height ? ` - ${asset.width}x${asset.height}` : ""}
                  </p>
                  <p className={asset.status === "FAILED" ? "text-red-700" : "text-neutral-600"}>
                    {asset.status}
                    {asset.failureReason ? ` - ${asset.failureReason}` : ""}
                  </p>
                  {asset.previewUrl ? (
                    <a className="underline" href={asset.previewUrl} target="_blank" rel="noreferrer">
                      Preview
                    </a>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    aria-label={`Move ${asset.originalFilename} up`}
                    className="min-h-11 rounded border bg-white px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    type="button"
                    disabled={assetIndex === 0}
                    onClick={() => setAssets((previous) => moveAssetByOffset(previous, asset.id, -1))}
                  >
                    Move Up
                  </button>
                  <button
                    aria-label={`Move ${asset.originalFilename} down`}
                    className="min-h-11 rounded border bg-white px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    type="button"
                    disabled={assetIndex === assets.length - 1}
                    onClick={() => setAssets((previous) => moveAssetByOffset(previous, asset.id, 1))}
                  >
                    Move Down
                  </button>
                  {deleteCandidateId === asset.id ? (
                    <span className="flex flex-wrap items-center gap-2 rounded border border-red-200 bg-red-50 p-2" role="group" aria-label={`Confirm deletion of ${asset.originalFilename}`}>
                      <button className="min-h-11 rounded bg-red-700 px-3 py-2 text-xs font-medium text-white" type="button" onClick={() => deleteAsset(asset.id)}>
                        Delete Permanently
                      </button>
                      <button className="min-h-11 rounded border bg-white px-3 py-2 text-xs" type="button" onClick={() => setDeleteCandidateId(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      className="min-h-11 rounded border border-red-300 px-3 py-2 text-xs text-red-700"
                      type="button"
                      onClick={() => setDeleteCandidateId(asset.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {nextCursor ? (
            <button
              className="rounded border bg-white px-3 py-2 text-xs font-medium disabled:opacity-60"
              type="button"
              onClick={loadMoreAssets}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading…" : `Load More Assets (${assets.length}${totalCount ? ` of ${totalCount}` : ""})`}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-neutral-600">No assets uploaded yet.</p>
      )}
    </div>
  );
}
