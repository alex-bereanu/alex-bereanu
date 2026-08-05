"use client";

import { MouseEvent, useRef, useState, useSyncExternalStore } from "react";

type ClientPhotoActionsProps = {
  downloadHref: string;
  filename: string;
  compact?: boolean;
};

type DeliveryTelemetryEvent = "prepare_cancelled" | "prepare_failed" | "share_failed" | "save_fallback_used";

function shareSupportsFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File([""], "photo.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}

const subscribeToShareCapability = () => () => undefined;

function reportClientDelivery(event: DeliveryTelemetryEvent, compact: boolean): void {
  const body = JSON.stringify({
    event,
    network: typeof navigator === "undefined" ? "unknown" : navigator.onLine ? "online" : "offline",
    surface: compact ? "grid" : "list",
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/telemetry/client-delivery", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/telemetry/client-delivery", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  });
}

async function prepareClientPhoto(
  downloadHref: string,
  filename: string,
  signal: AbortSignal,
  onProgress: (progress: number | null) => void,
): Promise<File> {
  const separator = downloadHref.includes("?") ? "&" : "?";
  const response = await fetch(`${downloadHref}${separator}intent=share`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error("share_fetch_failed");

  const totalBytes = Number(response.headers.get("content-length") ?? 0);
  let blob: Blob;
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Uint8Array.from(value).buffer);
      receivedBytes += value.byteLength;
      onProgress(totalBytes > 0 ? Math.min(receivedBytes / totalBytes, 1) : null);
    }
    blob = new Blob(chunks, { type: response.headers.get("content-type") ?? "application/octet-stream" });
  } else {
    blob = await response.blob();
  }

  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  if (!navigator.canShare?.({ files: [file] })) throw new Error("file_share_unavailable");
  return file;
}

export function ClientPhotoActions({ downloadHref, filename, compact = false }: ClientPhotoActionsProps) {
  const canShare = useSyncExternalStore(subscribeToShareCapability, shareSupportsFiles, () => false);
  const [preparedFile, setPreparedFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "preparing" | "ready" | "shared" | "error">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  function stop(event: MouseEvent<HTMLElement>): void {
    event.stopPropagation();
  }

  async function share(event: MouseEvent<HTMLButtonElement>): Promise<void> {
    stop(event);
    if (state === "preparing") {
      abortControllerRef.current?.abort();
      reportClientDelivery("prepare_cancelled", compact);
      return;
    }

    try {
      if (!preparedFile) {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setState("preparing");
        setProgress(0);
        setPreparedFile(await prepareClientPhoto(downloadHref, filename, controller.signal, setProgress));
        setState("ready");
        setProgress(1);
        return;
      }
      await navigator.share({ files: [preparedFile], title: filename });
      setPreparedFile(null);
      setState("shared");
      setProgress(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setState("idle");
        setProgress(null);
      } else {
        setState("error");
        setProgress(null);
        reportClientDelivery(preparedFile ? "share_failed" : "prepare_failed", compact);
      }
    } finally {
      abortControllerRef.current = null;
    }
  }

  const separator = downloadHref.includes("?") ? "&" : "?";
  return (
    <div className={compact ? "client-photo-actions client-photo-actions-overlay" : "client-photo-actions"}>
      <a
        className={compact ? "client-photo-action-icon" : "editorial-button client-photo-action"}
        href={`${downloadHref}${separator}intent=download`}
        aria-label={compact ? `Save ${filename} in full quality` : undefined}
        title={compact ? "Save full quality" : undefined}
        onClick={(event) => {
          stop(event);
          if (state === "error") reportClientDelivery("save_fallback_used", compact);
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" /></svg>
        {compact ? <span className="sr-only">Save full quality</span> : <span>Save full quality</span>}
      </a>
      {canShare ? <button
        className={compact ? "client-photo-action-icon" : "editorial-button client-photo-action"}
        type="button"
        onClick={share}
        aria-busy={state === "preparing"}
        aria-label={compact ? `${state === "preparing" ? "Cancel preparation of" : "Share"} ${filename}` : undefined}
        title={compact ? state === "preparing" ? "Cancel preparation" : state === "ready" ? "Tap again to open Share" : "Prepare photo to share" : undefined}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 16V4m0 0 4 4m-4-4L8 8M5 13v6h14v-6" /></svg>
        {compact ? <span className="sr-only">{state === "preparing" ? "Cancel photo preparation" : state === "ready" ? "Tap again to share photo" : "Prepare photo to share"}</span> : <span>{state === "preparing" ? "Cancel preparation" : state === "ready" ? "Tap again to share" : "Share photo"}</span>}
      </button> : null}
      {compact && state === "ready" ? <span className="client-photo-share-ready" role="status">Tap Share again</span> : null}
      {!compact ? <a className="client-photo-view" href={`${downloadHref}${separator}intent=view`} target="_blank" rel="noreferrer" onClick={stop}>Open original</a> : null}
      {!compact && state === "preparing" ? <span className="client-photo-feedback" role="status">Preparing full quality{progress === null ? "…" : ` — ${Math.round(progress * 100)}%`}</span> : null}
      {!compact && state === "ready" ? <span className="client-photo-feedback" role="status">Photo ready. Tap Share again to open the system share sheet.</span> : null}
      {!compact && state === "shared" ? <span className="client-photo-feedback" role="status">Share sheet opened.</span> : null}
      {!compact && state === "error" ? <span className="client-photo-feedback client-photo-feedback-error" role="alert">Sharing is unavailable. Use Save full quality instead.</span> : null}
    </div>
  );
}
