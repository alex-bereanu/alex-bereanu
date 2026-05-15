"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AdminAssetUpload } from "@/components/admin-asset-upload";

type AssetListItem = {
  id: string;
  originalFilename: string;
  storageKey: string;
  smallStorageKey?: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
};

type AdminAssetManagerProps = {
  galleryId: string;
  assets: AssetListItem[];
  csrfToken: string;
  r2PublicBase?: string | null;
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

export function AdminAssetManager({ galleryId, assets: initialAssets, csrfToken, r2PublicBase }: AdminAssetManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [assets, setAssets] = useState(initialAssets);
  const [persistedOrder, setPersistedOrder] = useState(initialAssets.map((asset) => asset.id));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAssets(initialAssets);
    setPersistedOrder(initialAssets.map((asset) => asset.id));
  }, [initialAssets]);

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
      setMessage("Asset deleted from storage and database.");
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to delete asset.");
    }
  }

  return (
    <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">Assets</h3>
      <p className="mt-1 text-xs text-neutral-600">Drag and drop to reorder, then click Save order.</p>

      <AdminAssetUpload galleryId={galleryId} csrfToken={csrfToken} />

      {assets.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <button
              className="rounded border bg-white px-2 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={saveOrder}
              disabled={!isOrderDirty || isPending}
            >
              Save order
            </button>
            {message ? <span className="text-[11px] text-emerald-700">{message}</span> : null}
            {error ? <span className="text-[11px] text-red-700">{error}</span> : null}
          </div>

          {assets.map((asset) => {
            const previewUrl = r2PublicBase ? `${r2PublicBase}/${asset.smallStorageKey ?? asset.storageKey}` : null;

            return (
              <div
                key={asset.id}
                className="flex cursor-move items-center justify-between gap-2 rounded border bg-white px-2 py-1.5 text-xs"
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
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{asset.originalFilename}</p>
                  <p className="text-neutral-600">
                    {asset.mimeType}
                    {asset.width && asset.height ? ` - ${asset.width}x${asset.height}` : ""}
                  </p>
                  {previewUrl ? (
                    <a className="underline" href={previewUrl} target="_blank" rel="noreferrer">
                      Preview
                    </a>
                  ) : null}
                </div>

                <button
                  className="rounded border border-red-300 px-2 py-1 text-[11px] text-red-700"
                  type="button"
                  onClick={() => deleteAsset(asset.id)}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-xs text-neutral-600">No assets uploaded yet.</p>
      )}
    </div>
  );
}
