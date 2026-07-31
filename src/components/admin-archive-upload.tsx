"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
  formatBytes,
  MAX_ARCHIVE_SIZE_BYTES,
  MAX_PARALLEL_MULTIPART_PARTS,
} from "@/lib/upload-limits";

type AdminArchiveUploadProps = {
  galleryId: string;
  csrfToken: string;
  currentArchiveFilename?: string | null;
};

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; message: string; percent: number }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type MultipartDescriptor = {
  uploadSessionId: string;
  partSizeBytes: number;
  totalParts: number;
  uploadedParts: Array<{ partNumber: number; sizeBytes: number }>;
  alreadyUploaded: boolean;
};

type SessionPayload = { uploadSessionId: string };
type ErrorPayload = { error?: string };

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
  if (!response.ok) throw new Error(await responseError(response, "Archive upload request failed."));
  return response.json() as Promise<T>;
}

export function AdminArchiveUpload({ galleryId, csrfToken, currentArchiveFilename }: AdminArchiveUploadProps) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [activeCheckpoint, setActiveCheckpoint] = useState<UploadCheckpoint | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (state.status !== "uploading") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.status]);

  useEffect(() => {
    if (state.status === "error") statusRef.current?.focus();
  }, [state.status]);

  async function createSession(file: File, sha256: string, signal: AbortSignal): Promise<SessionPayload> {
    return postJson<SessionPayload>(
      "/admin/actions/galleries/archive-upload-url",
      {
        galleryId,
        filename: file.name,
        contentType: file.type || "application/zip",
        sizeBytes: file.size,
        sha256,
      },
      csrfToken,
      signal,
    );
  }

  async function prepareMultipart(
    file: File,
    sha256: string,
    checkpoint: UploadCheckpoint | null,
    signal: AbortSignal,
  ): Promise<{ checkpoint: UploadCheckpoint; descriptor: MultipartDescriptor }> {
    let current = checkpoint;

    if (!current) {
      const session = await createSession(file, sha256, signal);
      current = saveUploadCheckpoint({
        galleryId,
        kind: "archive",
        sha256,
        sizeBytes: file.size,
        uploadSessionId: session.uploadSessionId,
        status: "prepared",
      });
    }

    try {
      const descriptor = await postJson<MultipartDescriptor>(
        "/admin/actions/galleries/uploads/multipart/prepare",
        { galleryId, uploadSessionId: current.uploadSessionId, sha256, sizeBytes: file.size },
        csrfToken,
        signal,
      );
      return { checkpoint: current, descriptor };
    } catch {
      removeUploadCheckpoint(current);
      const session = await createSession(file, sha256, signal);
      current = saveUploadCheckpoint({
        galleryId,
        kind: "archive",
        sha256,
        sizeBytes: file.size,
        uploadSessionId: session.uploadSessionId,
        status: "prepared",
      });
      const descriptor = await postJson<MultipartDescriptor>(
        "/admin/actions/galleries/uploads/multipart/prepare",
        { galleryId, uploadSessionId: current.uploadSessionId, sha256, sizeBytes: file.size },
        csrfToken,
        signal,
      );
      return { checkpoint: current, descriptor };
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("archive");

    if (!(file instanceof File) || file.size <= 0) {
      setState({ status: "error", message: "Choose a ZIP file." });
      return;
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setState({ status: "error", message: "Only .zip archives are supported." });
      return;
    }
    if (file.size > MAX_ARCHIVE_SIZE_BYTES) {
      setState({ status: "error", message: `Archive must be ${formatBytes(MAX_ARCHIVE_SIZE_BYTES)} or smaller.` });
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setState({ status: "uploading", message: "Checking archive integrity…", percent: 0 });

    try {
      const sha256 = await sha256File(file, (percent) => {
        setState({ status: "uploading", message: `Checking archive integrity (${percent}%)…`, percent: Math.round(percent * 0.1) });
      });
      let checkpoint = findUploadCheckpoint({ galleryId, kind: "archive", sha256, sizeBytes: file.size });
      setActiveCheckpoint(checkpoint);

      if (checkpoint?.status === "queued") {
        setState({ status: "success", message: "This archive is already uploaded and queued for verification." });
        return;
      }

      const prepared = await prepareMultipart(file, sha256, checkpoint, abortController.signal);
      checkpoint = prepared.checkpoint;
      setActiveCheckpoint(checkpoint);
      const { descriptor } = prepared;

      if (!descriptor.alreadyUploaded) {
        const completedPartNumbers = new Set(descriptor.uploadedParts.map((part) => part.partNumber));
        const uploadedBytes = new Map<number, number>(
          descriptor.uploadedParts.map((part) => [part.partNumber, part.sizeBytes]),
        );
        const missingParts = Array.from({ length: descriptor.totalParts }, (_, index) => index + 1).filter(
          (partNumber) => !completedPartNumbers.has(partNumber),
        );

        const updateProgress = (partNumber: number, loaded: number) => {
          uploadedBytes.set(partNumber, loaded);
          const totalUploaded = [...uploadedBytes.values()].reduce((sum, value) => sum + value, 0);
          const percent = 10 + Math.round((totalUploaded / file.size) * 80);
          setState({
            status: "uploading",
            message: `Uploading archive part ${partNumber}/${descriptor.totalParts}…`,
            percent: Math.min(90, percent),
          });
        };

        await runBounded(missingParts, MAX_PARALLEL_MULTIPART_PARTS, async (partNumber) => {
          const start = (partNumber - 1) * descriptor.partSizeBytes;
          const end = Math.min(file.size, start + descriptor.partSizeBytes);
          const part = file.slice(start, end);

          await withUploadRetries(async () => {
            const { uploadUrl } = await postJson<{ uploadUrl: string }>(
              "/admin/actions/galleries/uploads/multipart/part-url",
              { galleryId, uploadSessionId: checkpoint!.uploadSessionId, partNumber },
              csrfToken,
              abortController.signal,
            );
            await uploadBlobWithProgress({
              url: uploadUrl,
              body: part,
              signal: abortController.signal,
              onProgress: (loaded) => updateProgress(partNumber, loaded),
            });
            updateProgress(partNumber, part.size);
          }, abortController.signal);
        });

        await postJson(
          "/admin/actions/galleries/uploads/multipart/complete",
          { galleryId, uploadSessionId: checkpoint.uploadSessionId },
          csrfToken,
          abortController.signal,
        );
        checkpoint = saveUploadCheckpoint({ ...checkpoint, status: "uploaded" });
        setActiveCheckpoint(checkpoint);
      }

      setState({ status: "uploading", message: "Queueing malware scan and archive verification…", percent: 95 });
      await withUploadRetries(
        () => postJson(
          "/admin/actions/galleries/archive-finalize",
          { galleryId, uploadSessionId: checkpoint!.uploadSessionId },
          csrfToken,
          abortController.signal,
        ),
        abortController.signal,
      );
      checkpoint = saveUploadCheckpoint({ ...checkpoint, status: "queued" });
      setActiveCheckpoint(checkpoint);
      setState({ status: "success", message: "Gallery ZIP uploaded. Malware scanning and verification are queued." });
      form.reset();
      router.refresh();
    } catch (error) {
      const paused = abortController.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      setState({
        status: "error",
        message: paused
          ? "Archive upload paused. Reselect the same ZIP and choose Resume Archive to continue from confirmed parts."
          : error instanceof Error ? `${error.message} Reselect the same ZIP to resume.` : "Archive upload failed. Reselect the same ZIP to resume.",
      });
    } finally {
      abortControllerRef.current = null;
    }
  }

  async function discardUpload(): Promise<void> {
    if (!activeCheckpoint || activeCheckpoint.status === "queued") return;
    abortControllerRef.current?.abort();
    try {
      await postJson(
        "/admin/actions/galleries/uploads/multipart/abort",
        { galleryId, uploadSessionId: activeCheckpoint.uploadSessionId },
        csrfToken,
      );
      removeUploadCheckpoint(activeCheckpoint);
      setActiveCheckpoint(null);
      setState({ status: "idle" });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Unable to discard archive upload." });
    }
  }

  return (
    <form className="mt-3 grid gap-3" onSubmit={handleSubmit}>
      <p className="text-xs text-neutral-600">
        Current archive: <span className="font-medium break-words">{currentArchiveFilename ?? "none"}</span>
      </p>
      <label className="form-field">
        <span>Gallery ZIP Archive</span>
        <input className="rounded border px-3 py-2 text-base" name="archive" type="file" accept=".zip,application/zip" />
        <span className="form-helper">
          Up to {formatBytes(MAX_ARCHIVE_SIZE_BYTES)}. Uploads use resumable 16 MB parts; reselect the same file after a reload to continue.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button className="min-h-11 rounded border bg-white px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={state.status === "uploading"}>
          {state.status === "uploading" ? "Uploading…" : "Upload or Resume Archive"}
        </button>
        {state.status === "uploading" ? (
          <button className="min-h-11 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900" type="button" onClick={() => abortControllerRef.current?.abort()}>
            Pause Upload
          </button>
        ) : null}
        {activeCheckpoint && activeCheckpoint.status !== "queued" ? (
          <button className="min-h-11 rounded border border-red-300 px-3 py-2 text-xs font-medium text-red-700" type="button" onClick={discardUpload}>
            Cancel & Discard Parts
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
