"use client";

import { MAX_UPLOAD_RETRIES } from "@/lib/upload-limits";

const CHECKPOINT_VERSION = "v1";
const CHECKPOINT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type UploadCheckpoint = {
  galleryId: string;
  kind: "asset" | "archive";
  sha256: string;
  sizeBytes: number;
  uploadSessionId: string;
  status: "prepared" | "uploaded" | "queued";
  updatedAt: number;
};

function storageKey(galleryId: string): string {
  return `alex-media-upload:${CHECKPOINT_VERSION}:${galleryId}`;
}

function readCheckpoints(galleryId: string): UploadCheckpoint[] {
  try {
    const raw = window.localStorage.getItem(storageKey(galleryId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - CHECKPOINT_MAX_AGE_MS;

    return parsed.filter((value): value is UploadCheckpoint => {
      if (!value || typeof value !== "object") return false;
      const item = value as Partial<UploadCheckpoint>;
      return (
        item.galleryId === galleryId &&
        (item.kind === "asset" || item.kind === "archive") &&
        typeof item.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(item.sha256) &&
        typeof item.sizeBytes === "number" &&
        typeof item.uploadSessionId === "string" &&
        (item.status === "prepared" || item.status === "uploaded" || item.status === "queued") &&
        typeof item.updatedAt === "number" &&
        item.updatedAt >= cutoff
      );
    });
  } catch {
    return [];
  }
}

function writeCheckpoints(galleryId: string, checkpoints: UploadCheckpoint[]): void {
  try {
    window.localStorage.setItem(storageKey(galleryId), JSON.stringify(checkpoints.slice(-150)));
  } catch {
    // Resume remains best-effort when browser storage is unavailable.
  }
}

export function findUploadCheckpoint(input: {
  galleryId: string;
  kind: "asset" | "archive";
  sha256: string;
  sizeBytes: number;
}): UploadCheckpoint | null {
  return readCheckpoints(input.galleryId).find(
    (checkpoint) =>
      checkpoint.kind === input.kind && checkpoint.sha256 === input.sha256 && checkpoint.sizeBytes === input.sizeBytes,
  ) ?? null;
}

export function saveUploadCheckpoint(checkpoint: Omit<UploadCheckpoint, "updatedAt">): UploadCheckpoint {
  const nextCheckpoint = { ...checkpoint, updatedAt: Date.now() };
  const checkpoints = readCheckpoints(checkpoint.galleryId).filter(
    (item) => !(item.kind === checkpoint.kind && item.sha256 === checkpoint.sha256 && item.sizeBytes === checkpoint.sizeBytes),
  );
  checkpoints.push(nextCheckpoint);
  writeCheckpoints(checkpoint.galleryId, checkpoints);
  return nextCheckpoint;
}

export function removeUploadCheckpoint(checkpoint: Pick<UploadCheckpoint, "galleryId" | "kind" | "sha256" | "sizeBytes">): void {
  writeCheckpoints(
    checkpoint.galleryId,
    readCheckpoints(checkpoint.galleryId).filter(
      (item) => !(item.kind === checkpoint.kind && item.sha256 === checkpoint.sha256 && item.sizeBytes === checkpoint.sizeBytes),
    ),
  );
}

function abortError(): DOMException {
  return new DOMException("Upload paused.", "AbortError");
}

async function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timeoutId);
      reject(abortError());
    }, { once: true });
  });
}

async function waitForOnline(signal?: AbortSignal): Promise<void> {
  if (navigator.onLine) return;
  await new Promise<void>((resolve, reject) => {
    const handleOnline = () => {
      cleanup();
      resolve();
    };
    const handleAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => {
      window.removeEventListener("online", handleOnline);
      signal?.removeEventListener("abort", handleAbort);
    };
    window.addEventListener("online", handleOnline, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function withUploadRetries<T>(operation: (attempt: number) => Promise<T>, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt += 1) {
    if (signal?.aborted) throw abortError();
    await waitForOnline(signal);
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (attempt < MAX_UPLOAD_RETRIES) await wait(500 * 2 ** (attempt - 1), signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Upload failed after retries.");
}

export async function runBounded<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(workers);
}

export function uploadBlobWithProgress(input: {
  url: string;
  body: Blob;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", input.url);
    for (const [name, value] of Object.entries(input.headers ?? {})) request.setRequestHeader(name, value);

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) input.onProgress?.(event.loaded, event.total);
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Storage upload returned ${request.status}.`));
    });
    request.addEventListener("error", () => reject(new Error("Storage upload was interrupted.")));
    request.addEventListener("abort", () => reject(abortError()));

    const handleAbort = () => request.abort();
    input.signal?.addEventListener("abort", handleAbort, { once: true });
    request.addEventListener("loadend", () => input.signal?.removeEventListener("abort", handleAbort), { once: true });
    request.send(input.body);
  });
}
