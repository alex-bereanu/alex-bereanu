"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type AdminArchiveUploadProps = {
  galleryId: string;
  currentArchiveFilename?: string | null;
};

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type SignedArchiveUploadPayload = {
  uploadUrl: string;
  objectKey: string;
  filename: string;
};

async function uploadArchiveViaSignedUrl(payload: SignedArchiveUploadPayload, file: File): Promise<boolean> {
  try {
    const putResponse = await fetch(payload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/zip",
      },
      body: file,
    });

    return putResponse.ok;
  } catch {
    return false;
  }
}

async function uploadArchiveViaServer(input: {
  galleryId: string;
  objectKey: string;
  contentType: string;
  file: File;
}): Promise<boolean> {
  const relayPayload = new FormData();
  relayPayload.set("galleryId", input.galleryId);
  relayPayload.set("objectKey", input.objectKey);
  relayPayload.set("contentType", input.contentType);
  relayPayload.set("file", input.file, input.file.name);

  const relayResponse = await fetch("/admin/actions/galleries/archive-upload", {
    method: "POST",
    body: relayPayload,
  });

  return relayResponse.ok;
}

export function AdminArchiveUpload({ galleryId, currentArchiveFilename }: AdminArchiveUploadProps) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const shouldUseDirectUpload =
    typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("archive") as File | null;

    if (!file) {
      setState({ status: "error", message: "Please choose a ZIP file." });
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setState({ status: "error", message: "Only .zip files are supported." });
      return;
    }

    setState({ status: "uploading" });

    try {
      const uploadUrlResponse = await fetch("/admin/actions/galleries/archive-upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          galleryId,
          filename: file.name,
          contentType: file.type || "application/zip",
          sizeBytes: file.size,
        }),
      });

      if (!uploadUrlResponse.ok) {
        throw new Error("Unable to get upload URL.");
      }

      const uploadPayload = (await uploadUrlResponse.json()) as SignedArchiveUploadPayload;
      const directUploadSucceeded = shouldUseDirectUpload
        ? await uploadArchiveViaSignedUrl(uploadPayload, file)
        : false;

      if (!directUploadSucceeded) {
        const serverUploadSucceeded = await uploadArchiveViaServer({
          galleryId,
          objectKey: uploadPayload.objectKey,
          contentType: file.type || "application/zip",
          file,
        });

        if (!serverUploadSucceeded) {
          throw new Error("Archive upload failed.");
        }
      }

      const finalizeResponse = await fetch("/admin/actions/galleries/archive-finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          galleryId,
          objectKey: uploadPayload.objectKey,
          filename: uploadPayload.filename,
        }),
      });

      if (!finalizeResponse.ok) {
        throw new Error("Unable to save archive metadata.");
      }

      setState({ status: "success", message: "Gallery ZIP uploaded and attached successfully." });
      form.reset();
      router.refresh();
    } catch {
      setState({ status: "error", message: "Archive upload failed. Please retry." });
    }
  }

  return (
    <form className="mt-3 grid gap-2" onSubmit={handleSubmit}>
      <p className="text-xs text-neutral-600">
        Current archive: <span className="font-medium">{currentArchiveFilename ?? "none"}</span>
      </p>
      <input className="rounded border px-3 py-2 text-xs" name="archive" type="file" accept=".zip,application/zip" />
      <button
        className="rounded border bg-white px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={state.status === "uploading"}
      >
        {state.status === "uploading" ? "Uploading..." : "Upload gallery ZIP"}
      </button>

      {state.status === "success" ? <p className="text-xs text-emerald-700">{state.message}</p> : null}
      {state.status === "error" ? <p className="text-xs text-red-700">{state.message}</p> : null}
    </form>
  );
}

