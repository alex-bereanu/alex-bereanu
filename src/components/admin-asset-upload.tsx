"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { sha256File } from "@/lib/file-hash";
import {
  findUploadCheckpoint,
  removeUploadCheckpoint,
  runBounded,
  saveUploadCheckpoint,
  uploadBlobWithProgress,
  withUploadRetries,
  type UploadCheckpoint,
} from "@/lib/resumable-upload";
import {
  BYTES_PER_MEGABYTE,
  formatBytes,
  MAX_GALLERY_ASSET_SIZE_BYTES,
  MAX_GALLERY_ASSET_UPLOAD_COUNT,
  MAX_PARALLEL_PHOTO_UPLOADS,
} from "@/lib/upload-limits";

type AdminAssetUploadProps = {
  galleryId: string;
  csrfToken: string;
};

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; message: string; percent: number }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type SignedUploadPayload = {
  uploadUrl: string;
  uploadSessionId: string;
  contentType: string;
  cacheControl: string;
  requiredHeaders: Record<string, string>;
  alreadyUploaded?: boolean;
};

type ErrorPayload = { error?: string };
const SERVER_RELAY_LIMIT_BYTES = 20 * BYTES_PER_MEGABYTE;
const HEIC_PATTERN = /\.(heic|heif)$/i;

function imageContentType(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension ? `image/${extension}` : "application/octet-stream";
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ErrorPayload;
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

async function postJson<T>(url: string, body: Record<string, unknown>, csrfToken: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify({ ...body, csrfToken }),
    signal,
  });
  if (!response.ok) throw new Error(await responseError(response, "Upload request failed."));
  return response.json() as Promise<T>;
}

async function relaySmallAsset(input: {
  file: File;
  galleryId: string;
  uploadSessionId: string;
  csrfToken: string;
  signal: AbortSignal;
}): Promise<void> {
  const body = new FormData();
  body.set("csrfToken", input.csrfToken);
  body.set("galleryId", input.galleryId);
  body.set("uploadSessionId", input.uploadSessionId);
  body.set("file", input.file, input.file.name);
  const response = await fetch("/admin/actions/galleries/assets-upload", { method: "POST", body, signal: input.signal });
  if (!response.ok) throw new Error(await responseError(response, "Image upload failed."));
}

export function AdminAssetUpload({ galleryId, csrfToken }: AdminAssetUploadProps) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [selectedCount, setSelectedCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);

  const canSubmit = useMemo(() => selectedCount > 0 && state.status !== "uploading", [selectedCount, state.status]);

  useEffect(() => {
    if (state.status !== "uploading") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.status]);

  useEffect(() => {
    if (state.status === "error") statusRef.current?.focus();
  }, [state.status]);

  async function createOrResumeSession(
    file: File,
    sha256: string,
    checkpoint: UploadCheckpoint | null,
    signal: AbortSignal,
  ): Promise<SignedUploadPayload> {
    if (checkpoint && checkpoint.status !== "queued") {
      try {
        return await postJson<SignedUploadPayload>(
          "/admin/actions/galleries/uploads/resume-url",
          { galleryId, uploadSessionId: checkpoint.uploadSessionId, sha256, sizeBytes: file.size },
          csrfToken,
          signal,
        );
      } catch {
        removeUploadCheckpoint(checkpoint);
      }
    }

    return postJson<SignedUploadPayload>(
      "/admin/actions/galleries/assets-upload-url",
      {
        galleryId,
        filename: file.name,
        contentType: imageContentType(file),
        sizeBytes: file.size,
        sha256,
      },
      csrfToken,
      signal,
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const files = Array.from(new FormData(form).getAll("assets")).filter(
      (value): value is File => value instanceof File && value.size > 0,
    );

    if (files.length === 0) {
      setState({ status: "error", message: "Choose at least one image file." });
      return;
    }
    if (files.length > MAX_GALLERY_ASSET_UPLOAD_COUNT) {
      setState({ status: "error", message: `Choose ${MAX_GALLERY_ASSET_UPLOAD_COUNT} images or fewer per upload.` });
      return;
    }
    const heicFile = files.find((file) => HEIC_PATTERN.test(file.name) || /hei[cf]/i.test(file.type));
    if (heicFile) {
      setState({ status: "error", message: `${heicFile.name} is HEIC/HEIF. Export it as JPG before uploading.` });
      return;
    }
    const oversizedFile = files.find((file) => file.size > MAX_GALLERY_ASSET_SIZE_BYTES);
    if (oversizedFile) {
      setState({ status: "error", message: `${oversizedFile.name} exceeds ${formatBytes(MAX_GALLERY_ASSET_SIZE_BYTES)}.` });
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const progressByIndex = new Map<number, number>();
    let completedCount = 0;

    const updateProgress = (index: number, percent: number, message: string) => {
      progressByIndex.set(index, percent);
      const overall = Math.round([...progressByIndex.values()].reduce((sum, value) => sum + value, 0) / files.length);
      setState({ status: "uploading", message, percent: overall });
    };

    setState({ status: "uploading", message: `Preparing ${files.length} images…`, percent: 0 });

    try {
      await runBounded(files, MAX_PARALLEL_PHOTO_UPLOADS, async (file, index) => {
        const sha256 = await sha256File(file, (percent) => updateProgress(index, Math.round(percent * 0.15), `Checking ${file.name}…`));
        let checkpoint = findUploadCheckpoint({ galleryId, kind: "asset", sha256, sizeBytes: file.size });

        if (checkpoint?.status === "queued") {
          completedCount += 1;
          updateProgress(index, 100, `${completedCount}/${files.length} images already completed.`);
          return;
        }

        const upload = await createOrResumeSession(file, sha256, checkpoint, abortController.signal);
        checkpoint = saveUploadCheckpoint({
          galleryId,
          kind: "asset",
          sha256,
          sizeBytes: file.size,
          uploadSessionId: upload.uploadSessionId,
          status: checkpoint?.status === "uploaded" || upload.alreadyUploaded ? "uploaded" : "prepared",
        });

        if (checkpoint.status !== "uploaded") {
          try {
            await withUploadRetries(
              () => uploadBlobWithProgress({
                url: upload.uploadUrl,
                body: file,
                headers: {
                  "Content-Type": upload.contentType,
                  "Cache-Control": upload.cacheControl,
                  ...upload.requiredHeaders,
                },
                signal: abortController.signal,
                onProgress: (loaded, total) =>
                  updateProgress(index, 15 + Math.round((loaded / total) * 75), `Uploading ${file.name}…`),
              }),
              abortController.signal,
            );
          } catch (error) {
            if (file.size > SERVER_RELAY_LIMIT_BYTES || abortController.signal.aborted) throw error;
            updateProgress(index, 60, `Retrying ${file.name} through the secure server relay…`);
            await relaySmallAsset({ file, galleryId, uploadSessionId: upload.uploadSessionId, csrfToken, signal: abortController.signal });
          }
          checkpoint = saveUploadCheckpoint({ ...checkpoint, status: "uploaded" });
        }

        await withUploadRetries(
          () => postJson(
            "/admin/actions/galleries/assets-finalize",
            { galleryId, uploadSessionIds: [upload.uploadSessionId] },
            csrfToken,
            abortController.signal,
          ),
          abortController.signal,
        );
        saveUploadCheckpoint({ ...checkpoint, status: "queued" });
        completedCount += 1;
        updateProgress(index, 100, `${completedCount}/${files.length} images queued for verification.`);
      });

      setState({ status: "success", message: `${files.length} images are uploaded or already complete. Verification is queued.` });
      setSelectedCount(0);
      form.reset();
      router.refresh();
    } catch (error) {
      const paused = abortController.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      setState({
        status: "error",
        message: paused
          ? "Upload paused. Keep the same files selected and choose Resume Uploads when ready."
          : error instanceof Error ? `${error.message} Select the same files to resume completed work.` : "Upload failed. Select the same files to resume.",
      });
    } finally {
      abortControllerRef.current = null;
    }
  }

  return (
    <form className="mt-3 grid gap-3" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Upload Images</span>
        <input
          className="block w-full rounded border px-3 py-2 text-base"
          name="assets"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif,.avif,image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          onChange={(event) => setSelectedCount(event.currentTarget.files?.length ?? 0)}
        />
        <span className="form-helper">
          JPG, PNG, WebP, GIF, or AVIF. HEIC is rejected early; export it as JPG. Up to {MAX_GALLERY_ASSET_UPLOAD_COUNT} images, {formatBytes(MAX_GALLERY_ASSET_SIZE_BYTES)} each.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button className="min-h-11 rounded border bg-white px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={!canSubmit}>
          {state.status === "uploading" ? "Uploading…" : "Upload or Resume Selected Images"}
        </button>
        {state.status === "uploading" ? (
          <button className="min-h-11 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900" type="button" onClick={() => abortControllerRef.current?.abort()}>
            Pause Uploads
          </button>
        ) : null}
      </div>

      {state.status === "uploading" ? (
        <div className="grid gap-1" aria-live="polite">
          <progress className="h-2 w-full" max={100} value={state.percent}>{state.percent}%</progress>
          <p className="text-xs text-neutral-700">{state.message}</p>
        </div>
      ) : null}
      {state.status === "success" ? <p className="text-xs text-emerald-700" aria-live="polite">{state.message}</p> : null}
      {state.status === "error" ? <p ref={statusRef} className="text-xs text-red-700" role="alert" tabIndex={-1}>{state.message}</p> : null}
    </form>
  );
}
