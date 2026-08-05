"use client";

import Image from "next/image";
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
  altText?: string | null;
  caption?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  capturedAt?: string | null;
};

type AdminAssetManagerProps = {
  galleryId: string;
  assets: AssetListItem[];
  csrfToken: string;
  initialNextCursor?: string | null;
  totalCount?: number;
  phase2Enabled?: boolean;
  moveTargets?: Array<{ id: string; title: string }>;
};

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function moveAsset(assets: AssetListItem[], draggedId: string, targetId: string): AssetListItem[] {
  const from = assets.findIndex((asset) => asset.id === draggedId);
  const to = assets.findIndex((asset) => asset.id === targetId);
  if (from < 0 || to < 0 || from === to) return assets;
  const next = [...assets];
  const [asset] = next.splice(from, 1);
  if (!asset) return assets;
  next.splice(to, 0, asset);
  return next;
}

function moveAssetByOffset(assets: AssetListItem[], assetId: string, offset: -1 | 1): AssetListItem[] {
  const index = assets.findIndex((asset) => asset.id === assetId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= assets.length) return assets;
  const next = [...assets];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

function dateTimeLocal(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function AssetMetadataForm({ asset, galleryId, csrfToken }: { asset: AssetListItem; galleryId: string; csrfToken: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(formData: FormData) {
    setState("saving");
    const numberOrNull = (name: string) => {
      const raw = String(formData.get(name) ?? "").trim();
      return raw ? Number(raw) : null;
    };
    const capturedAt = String(formData.get("capturedAt") ?? "").trim();
    try {
      const response = await fetch("/admin/actions/galleries/assets-metadata", {
        method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          csrfToken, galleryId, assetId: asset.id,
          altText: String(formData.get("altText") ?? "").trim() || null,
          caption: String(formData.get("caption") ?? "").trim() || null,
          focalX: numberOrNull("focalX"), focalY: numberOrNull("focalY"),
          capturedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
        }),
      });
      if (!response.ok) throw new Error("metadata_failed");
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <details className="mt-3 rounded border border-neutral-200 bg-neutral-50 p-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold">Caption, alt text, date, and focal point</summary>
      <form className="admin-form-grid mt-3" action={save}>
        <label className="admin-form-field"><span>Alt text</span><input name="altText" defaultValue={asset.altText ?? ""} maxLength={300} /><span className="admin-form-helper">Describe the visible subject and context; leave empty only when the photo is purely decorative.</span></label>
        <label className="admin-form-field"><span>Caption</span><textarea name="caption" defaultValue={asset.caption ?? ""} maxLength={2000} rows={3} /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="admin-form-field"><span>Captured at</span><input name="capturedAt" type="datetime-local" defaultValue={dateTimeLocal(asset.capturedAt)} /></label>
          <label className="admin-form-field"><span>Focal X (0–1)</span><input name="focalX" type="number" min="0" max="1" step="0.01" defaultValue={asset.focalX ?? ""} /></label>
          <label className="admin-form-field"><span>Focal Y (0–1)</span><input name="focalY" type="number" min="0" max="1" step="0.01" defaultValue={asset.focalY ?? ""} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3"><button className="admin-secondary-button" disabled={state === "saving"} type="submit">{state === "saving" ? "Saving…" : "Save metadata"}</button>{state === "saved" ? <span className="text-xs text-emerald-700" aria-live="polite">Saved.</span> : null}{state === "error" ? <span className="text-xs text-red-700" role="alert">Could not save metadata. Check the values and retry.</span> : null}</div>
      </form>
    </details>
  );
}

export function AdminAssetManager({
  galleryId, assets: initialAssets, csrfToken, initialNextCursor = null, totalCount,
  phase2Enabled = false, moveTargets = [],
}: AdminAssetManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assets, setAssets] = useState(initialAssets);
  const [persistedOrder, setPersistedOrder] = useState(initialAssets.map((asset) => asset.id));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchAction, setBatchAction] = useState<"RECYCLE" | "RETRY" | "MOVE">("RECYCLE");
  const [targetGalleryId, setTargetGalleryId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const currentOrder = useMemo(() => assets.map((asset) => asset.id), [assets]);
  const isOrderDirty = useMemo(() => !arraysEqual(currentOrder, persistedOrder), [currentOrder, persistedOrder]);
  const allLoaded = nextCursor === null;

  function announceSuccess(value: string) { setMessage(value); setError(null); }
  function announceError(value: string) { setError(value); setMessage(null); }

  async function saveOrder() {
    if (!allLoaded) return announceError("Load every photo before changing the full-gallery order.");
    try {
      const response = await fetch("/admin/actions/galleries/assets-reorder", {
        method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ galleryId, assetIds: currentOrder, csrfToken }),
      });
      if (!response.ok) throw new Error("order_failed");
      setPersistedOrder(currentOrder);
      announceSuccess("Photo order saved.");
      startTransition(() => router.refresh());
    } catch { announceError("Failed to save the photo order."); }
  }

  async function removeAsset(assetId: string) {
    try {
      const response = await fetch("/admin/actions/galleries/assets-delete", {
        method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ galleryId, assetId, csrfToken }),
      });
      if (!response.ok) throw new Error("remove_failed");
      setAssets((current) => current.filter((asset) => asset.id !== assetId));
      setPersistedOrder((current) => current.filter((id) => id !== assetId));
      setSelectedIds((current) => { const next = new Set(current); next.delete(assetId); return next; });
      setDeleteCandidateId(null);
      announceSuccess(phase2Enabled ? "Photo moved to the 30-day Recycle Bin." : "Photo deleted and storage cleanup queued.");
      startTransition(() => router.refresh());
    } catch { announceError("Failed to remove the photo."); }
  }

  async function runBatchAction() {
    const assetIds = [...selectedIds];
    if (assetIds.length === 0) return;
    if (batchAction === "MOVE" && !targetGalleryId) return announceError("Choose a target gallery first.");
    try {
      const response = await fetch("/admin/actions/galleries/assets-batch", {
        method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ csrfToken, galleryId, assetIds, action: batchAction, targetGalleryId: targetGalleryId || undefined }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; affected?: number } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Batch action failed.");
      if (batchAction === "RECYCLE" || batchAction === "MOVE") {
        setAssets((current) => current.filter((asset) => !selectedIds.has(asset.id)));
        setPersistedOrder((current) => current.filter((id) => !selectedIds.has(id)));
      } else {
        setAssets((current) => current.map((asset) => selectedIds.has(asset.id) && asset.status === "FAILED" ? { ...asset, status: "PROCESSING", failureReason: null } : asset));
      }
      setSelectedIds(new Set());
      announceSuccess(`${payload?.affected ?? assetIds.length} photo${(payload?.affected ?? assetIds.length) === 1 ? "" : "s"} updated.`);
      startTransition(() => router.refresh());
    } catch (caught) { announceError(caught instanceof Error ? caught.message : "Batch action failed."); }
  }

  async function loadMoreAssets() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const response = await fetch(`/admin/actions/galleries/assets-page?galleryId=${encodeURIComponent(galleryId)}&cursor=${encodeURIComponent(nextCursor)}`, { cache: "no-store" });
      const payload = await response.json() as { assets?: AssetListItem[]; nextCursor?: string | null };
      if (!response.ok || !Array.isArray(payload.assets)) throw new Error("invalid_page");
      setAssets((current) => { const known = new Set(current.map((asset) => asset.id)); return [...current, ...payload.assets!.filter((asset) => !known.has(asset.id))]; });
      setPersistedOrder((current) => [...current, ...payload.assets!.map((asset) => asset.id).filter((id) => !current.includes(id))]);
      setNextCursor(payload.nextCursor ?? null);
    } catch { announceError("Failed to load more photos."); } finally { setIsLoadingMore(false); }
  }

  return (
    <div className="grid gap-5">
      <AdminAssetUpload galleryId={galleryId} csrfToken={csrfToken} />

      {assets.length > 0 ? (
        <>
          <div className="admin-asset-toolbar">
            <div className="flex flex-wrap items-center gap-2">
              <button className="admin-secondary-button" type="button" onClick={saveOrder} disabled={!isOrderDirty || isPending || !allLoaded}>Save order</button>
              {!allLoaded ? <span className="text-xs text-neutral-600">Load all photos to reorder the complete gallery.</span> : null}
            </div>
            {phase2Enabled ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="admin-form-field min-w-36"><span>Batch action</span><select value={batchAction} onChange={(event) => setBatchAction(event.currentTarget.value as typeof batchAction)}><option value="RECYCLE">Move to Recycle Bin</option><option value="RETRY">Retry processing</option><option value="MOVE">Move to gallery</option></select></label>
                {batchAction === "MOVE" ? <label className="admin-form-field min-w-48"><span>Target gallery</span><select value={targetGalleryId} onChange={(event) => setTargetGalleryId(event.currentTarget.value)}><option value="">Choose gallery</option>{moveTargets.map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}</select></label> : null}
                <button className="admin-primary-button" type="button" disabled={selectedIds.size === 0 || isPending} onClick={runBatchAction}>Apply to {selectedIds.size || 0}</button>
              </div>
            ) : null}
          </div>

          {message ? <p className="admin-alert admin-alert-success" aria-live="polite">{message}</p> : null}
          {error ? <p className="admin-alert admin-alert-error" role="alert">{error}</p> : null}

          <div className="admin-asset-grid">
            {assets.map((asset, index) => (
              <article
                key={asset.id}
                className="admin-asset-card"
                draggable={allLoaded}
                onDragStart={() => setDraggedId(asset.id)} onDragEnd={() => setDraggedId(null)}
                onDragOver={(event) => { if (allLoaded) event.preventDefault(); }}
                onDrop={(event) => { event.preventDefault(); if (allLoaded && draggedId) setAssets((current) => moveAsset(current, draggedId, asset.id)); setDraggedId(null); }}
                onKeyDown={(event) => { if (!allLoaded || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return; event.preventDefault(); setAssets((current) => moveAssetByOffset(current, asset.id, event.key === "ArrowUp" ? -1 : 1)); }}
                tabIndex={0}
              >
                <div className="admin-asset-preview">
                  {asset.previewUrl ? <Image src={asset.previewUrl} alt={asset.altText?.trim() || asset.originalFilename} width={asset.width ?? 800} height={asset.height ?? 600} sizes="(max-width: 640px) 92vw, (max-width: 1280px) 42vw, 360px" unoptimized /> : <div className="flex h-full items-center justify-center p-4 text-center text-xs uppercase text-neutral-500">Preview processing</div>}
                  {phase2Enabled ? <label className="admin-asset-select"><input type="checkbox" aria-label={`Select ${asset.originalFilename}`} checked={selectedIds.has(asset.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.currentTarget.checked) next.add(asset.id); else next.delete(asset.id); return next; })} /></label> : null}
                  <span className={`admin-asset-state admin-asset-state-${asset.status.toLowerCase()}`}>{asset.status}</span>
                </div>
                <div className="p-3">
                  <p className="break-words text-sm font-semibold">{asset.originalFilename}</p>
                  <p className="mt-1 text-xs text-neutral-600">{asset.width && asset.height ? `${asset.width} × ${asset.height}` : asset.mimeType}</p>
                  {asset.failureReason ? <p className="mt-2 font-mono text-xs text-red-700">{asset.failureReason}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="admin-secondary-button" type="button" disabled={!allLoaded || index === 0} onClick={() => setAssets((current) => moveAssetByOffset(current, asset.id, -1))} aria-label={`Move ${asset.originalFilename} earlier`}>Earlier</button>
                    <button className="admin-secondary-button" type="button" disabled={!allLoaded || index === assets.length - 1} onClick={() => setAssets((current) => moveAssetByOffset(current, asset.id, 1))} aria-label={`Move ${asset.originalFilename} later`}>Later</button>
                    {deleteCandidateId === asset.id ? <span className="flex flex-wrap gap-2 rounded border border-red-200 bg-red-50 p-2" role="group" aria-label={`Confirm removal of ${asset.originalFilename}`}><button className="admin-danger-button" type="button" onClick={() => removeAsset(asset.id)}>{phase2Enabled ? "Move to Bin" : "Delete permanently"}</button><button className="admin-secondary-button" type="button" onClick={() => setDeleteCandidateId(null)}>Cancel</button></span> : <button className="admin-danger-button" type="button" onClick={() => setDeleteCandidateId(asset.id)}>{phase2Enabled ? "Recycle" : "Delete"}</button>}
                  </div>
                  {phase2Enabled ? <AssetMetadataForm asset={asset} galleryId={galleryId} csrfToken={csrfToken} /> : null}
                </div>
              </article>
            ))}
          </div>
          {nextCursor ? <button className="admin-secondary-button justify-self-start" type="button" onClick={loadMoreAssets} disabled={isLoadingMore}>{isLoadingMore ? "Loading…" : `Load more (${assets.length}${totalCount ? ` of ${totalCount}` : ""})`}</button> : null}
        </>
      ) : <p className="admin-empty-state text-sm text-neutral-600">No photos uploaded yet. Add the first originals above; previews appear only after verification succeeds.</p>}
    </div>
  );
}
