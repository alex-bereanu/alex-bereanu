"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type RecycledAsset = {
  id: string;
  originalFilename: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  deletedAt: string;
  purgeAfter: string;
};

export function AdminRecycleBin({ galleryId, assets: initialAssets, csrfToken }: { galleryId: string; assets: RecycledAsset[]; csrfToken: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assets, setAssets] = useState(initialAssets);
  const [purgeCandidate, setPurgeCandidate] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ csrfToken, galleryId, ...body }) });
    const payload = await response.json().catch(() => null) as { error?: string; reauthenticationUrl?: string } | null;
    if (response.status === 428 && payload?.reauthenticationUrl) {
      window.location.assign(payload.reauthenticationUrl);
      return;
    }
    if (!response.ok) throw new Error(payload?.error ?? "Action failed.");
  }

  async function restore(assetId: string) {
    try {
      await post("/admin/actions/galleries/assets-restore", { assetIds: [assetId] });
      setAssets((current) => current.filter((asset) => asset.id !== assetId));
      setMessage("Photo restored to the gallery."); setError(null);
      startTransition(() => router.refresh());
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Restore failed."); setMessage(null); }
  }

  async function purge(assetId: string) {
    try {
      await post("/admin/actions/galleries/assets-purge", { assetId, confirmation });
      setAssets((current) => current.filter((asset) => asset.id !== assetId));
      setPurgeCandidate(null); setConfirmation(""); setMessage("Photo permanently removed; durable storage cleanup is running."); setError(null);
      startTransition(() => router.refresh());
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Purge failed."); setMessage(null); }
  }

  if (assets.length === 0) return <p className="text-sm text-neutral-600">The Recycle Bin is empty.</p>;

  return (
    <div className="grid gap-4">
      {message ? <p className="admin-alert admin-alert-success" aria-live="polite">{message}</p> : null}
      {error ? <p className="admin-alert admin-alert-error" role="alert">{error}</p> : null}
      <div className="admin-asset-grid">
        {assets.map((asset) => (
          <article key={asset.id} className="admin-asset-card">
            <div className="admin-asset-preview">{asset.previewUrl ? <Image src={asset.previewUrl} alt="" width={asset.width ?? 800} height={asset.height ?? 600} sizes="(max-width: 640px) 92vw, 360px" unoptimized /> : <div className="flex h-full items-center justify-center text-xs text-neutral-500">Preview unavailable</div>}</div>
            <div className="p-3">
              <h3 className="break-words text-sm font-semibold">{asset.originalFilename}</h3>
              <p className="mt-1 text-xs leading-5 text-neutral-600">Removed {new Date(asset.deletedAt).toLocaleString()}<br />Automatic purge after {new Date(asset.purgeAfter).toLocaleDateString()}</p>
              <div className="mt-3 flex flex-wrap gap-2"><button className="admin-primary-button" disabled={isPending} type="button" onClick={() => restore(asset.id)}>Restore</button><button className="admin-danger-button" disabled={isPending} type="button" onClick={() => { setPurgeCandidate(asset.id); setConfirmation(""); }}>Purge now</button></div>
              {purgeCandidate === asset.id ? <div className="mt-3 rounded border border-red-200 bg-red-50 p-3"><label className="admin-form-field"><span>Type PURGE to permanently delete this original and every derivative.</span><input value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} autoComplete="off" /></label><div className="mt-3 flex flex-wrap gap-2"><button className="admin-danger-button" disabled={confirmation !== "PURGE" || isPending} type="button" onClick={() => purge(asset.id)}>Permanently purge</button><button className="admin-secondary-button" type="button" onClick={() => { setPurgeCandidate(null); setConfirmation(""); }}>Cancel</button></div></div> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
