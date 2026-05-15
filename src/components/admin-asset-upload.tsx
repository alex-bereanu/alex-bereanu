"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { formatBytes, MAX_GALLERY_ASSET_SIZE_BYTES, MAX_GALLERY_ASSET_UPLOAD_COUNT } from "@/lib/upload-limits";

type AdminAssetUploadProps = {
  galleryId: string;
  csrfToken: string;
};

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type UploadMetadata = {
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  fileExtension?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  capturedAt?: string;
};

type SignedUploadPayload = {
  uploadUrl: string;
  objectKey: string;
  filename: string;
  contentType: string;
};

type ErrorPayload = {
  error?: string;
};

async function getResponseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ErrorPayload;
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

function getFileExtension(filename: string): string | undefined {
  const index = filename.lastIndexOf(".");

  if (index < 0 || index === filename.length - 1) {
    return undefined;
  }

  return filename.slice(index + 1).toLowerCase();
}

function getCapturedAtFromFile(file: File): string | undefined {
  if (!Number.isFinite(file.lastModified) || file.lastModified <= 0) {
    return undefined;
  }

  return new Date(file.lastModified).toISOString();
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number } | undefined> {
  if (!file.type.startsWith("image/")) {
    return undefined;
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const dimensions = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };

      URL.revokeObjectURL(objectUrl);
      resolve(dimensions);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read image dimensions."));
    };

    image.src = objectUrl;
  });
}

async function uploadAssetViaSignedUrl(payload: SignedUploadPayload, file: File): Promise<boolean> {
  try {
    const putResponse = await fetch(payload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": payload.contentType,
      },
      body: file,
    });

    return putResponse.ok;
  } catch {
    return false;
  }
}

async function uploadAssetViaServer(input: {
  galleryId: string;
  objectKey: string;
  contentType: string;
  file: File;
  csrfToken: string;
}): Promise<void> {
  const relayPayload = new FormData();
  relayPayload.set("csrfToken", input.csrfToken);
  relayPayload.set("galleryId", input.galleryId);
  relayPayload.set("objectKey", input.objectKey);
  relayPayload.set("contentType", input.contentType);
  relayPayload.set("file", input.file, input.file.name);

  const relayResponse = await fetch("/admin/actions/galleries/assets-upload", {
    method: "POST",
    body: relayPayload,
  });

  if (!relayResponse.ok) {
    throw new Error(await getResponseErrorMessage(relayResponse, "Image upload failed."));
  }
}

export function AdminAssetUpload({ galleryId, csrfToken }: AdminAssetUploadProps) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [selectedCount, setSelectedCount] = useState(0);

  const canSubmit = useMemo(() => selectedCount > 0 && state.status !== "uploading", [selectedCount, state.status]);
  const shouldUseDirectUpload =
    typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const files = formData.getAll("assets").filter((value): value is File => value instanceof File && value.size > 0);

    if (files.length === 0) {
      setState({ status: "error", message: "Choose at least one image file." });
      return;
    }

    if (files.length > MAX_GALLERY_ASSET_UPLOAD_COUNT) {
      setState({
        status: "error",
        message: `Choose ${MAX_GALLERY_ASSET_UPLOAD_COUNT.toLocaleString()} images or fewer per upload.`,
      });
      return;
    }

    const oversizedFile = files.find((file) => file.size > MAX_GALLERY_ASSET_SIZE_BYTES);

    if (oversizedFile) {
      setState({
        status: "error",
        message: `${oversizedFile.name} is ${formatBytes(oversizedFile.size)}. Gallery images must be ${formatBytes(
          MAX_GALLERY_ASSET_SIZE_BYTES,
        )} or smaller.`,
      });
      return;
    }

    setState({ status: "uploading", message: `Uploading ${files.length} file(s)...` });

    try {
      const uploaded: UploadMetadata[] = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]!;

        setState({
          status: "uploading",
          message: `Uploading ${index + 1}/${files.length}: ${file.name}`,
        });

        const [dimensions, uploadUrlResponse] = await Promise.all([
          getImageDimensions(file).catch(() => undefined),
          fetch("/admin/actions/galleries/assets-upload-url", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": csrfToken,
            },
            body: JSON.stringify({
              galleryId,
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              sizeBytes: file.size,
              csrfToken,
            }),
          }),
        ]);

        if (!uploadUrlResponse.ok) {
          throw new Error(await getResponseErrorMessage(uploadUrlResponse, `Unable to prepare upload for ${file.name}.`));
        }

        const uploadPayload = (await uploadUrlResponse.json()) as SignedUploadPayload;

        const directUploadSucceeded = shouldUseDirectUpload
          ? await uploadAssetViaSignedUrl(uploadPayload, file)
          : false;

        if (!directUploadSucceeded) {
          setState({
            status: "uploading",
            message: `Direct upload blocked, retrying via server: ${index + 1}/${files.length} (${file.name})`,
          });

          await uploadAssetViaServer({
            galleryId,
            objectKey: uploadPayload.objectKey,
            contentType: uploadPayload.contentType,
            file,
            csrfToken,
          });
        }

        uploaded.push({
          objectKey: uploadPayload.objectKey,
          originalFilename: file.name,
          mimeType: file.type || uploadPayload.contentType,
          fileExtension: getFileExtension(file.name),
          sizeBytes: file.size,
          width: dimensions?.width,
          height: dimensions?.height,
          capturedAt: getCapturedAtFromFile(file),
        });
      }

      const finalizeResponse = await fetch("/admin/actions/galleries/assets-finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          galleryId,
          uploads: uploaded,
          csrfToken,
        }),
      });

      if (!finalizeResponse.ok) {
        throw new Error(await getResponseErrorMessage(finalizeResponse, "Unable to finalize uploaded assets."));
      }

      setState({ status: "success", message: `Uploaded ${uploaded.length} file(s) successfully.` });
      setSelectedCount(0);
      form.reset();
      router.refresh();
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Image upload failed. Please try again." });
    }
  }

  return (
    <form className="mt-3 grid gap-2" onSubmit={handleSubmit}>
      <label className="text-xs text-neutral-700">
        Upload assets
        <input
          className="mt-1 block w-full rounded border px-3 py-2 text-xs"
          name="assets"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => setSelectedCount(event.currentTarget.files?.length ?? 0)}
        />
      </label>
      <p className="text-[11px] text-neutral-500">
        Max {MAX_GALLERY_ASSET_UPLOAD_COUNT.toLocaleString()} images per upload, {formatBytes(MAX_GALLERY_ASSET_SIZE_BYTES)} per image.
      </p>

      <button
        className="rounded border bg-white px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={!canSubmit}
      >
        {state.status === "uploading" ? "Uploading..." : "Upload selected images"}
      </button>

      {state.status === "uploading" ? <p className="text-xs text-neutral-700">{state.message}</p> : null}
      {state.status === "success" ? <p className="text-xs text-emerald-700">{state.message}</p> : null}
      {state.status === "error" ? <p className="text-xs text-red-700">{state.message}</p> : null}
    </form>
  );
}

