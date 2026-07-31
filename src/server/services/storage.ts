import "server-only";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

import { env, requireEnv } from "@/config/env";

export type StorageArea = "PUBLIC" | "PRIVATE";

type SignedUploadInput = {
  area?: StorageArea;
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
  metadata?: Record<string, string>;
};

type SignedDownloadInput = {
  area?: StorageArea;
  objectKey: string;
  expiresInSeconds?: number;
  downloadFilename?: string;
};

type UploadObjectInput = {
  area?: StorageArea;
  objectKey: string;
  contentType: string;
  body: Buffer;
  metadata?: Record<string, string>;
};

type CopyObjectInput = {
  area: StorageArea;
  sourceObjectKey: string;
  destinationObjectKey: string;
  contentType: string;
  metadata?: Record<string, string>;
};

export type StorageObjectStream = {
  body: ReadableStream<Uint8Array>;
  contentLength: number | null;
  contentType: string | null;
  etag: string | null;
};

export type StorageObjectMetadata = {
  contentLength: number | null;
  contentType: string | null;
  checksumSha256: string | null;
  etag: string | null;
  metadata: Record<string, string>;
};

export type MultipartUploadedPart = {
  partNumber: number;
  etag: string;
  sizeBytes: number;
};

let cachedClient: S3Client | null = null;
const REGION_CODE_IN_PARENS_PATTERN = /\(([a-z0-9-]+)\)\s*$/i;

function normalizeR2Region(regionValue: string | undefined): string {
  const trimmed = regionValue?.trim();

  if (!trimmed) {
    return "auto";
  }

  if (/^[a-z0-9-]+$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const regionCodeMatch = REGION_CODE_IN_PARENS_PATTERN.exec(trimmed);
  return regionCodeMatch?.[1] ? regionCodeMatch[1].toLowerCase() : "auto";
}

function getR2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function getClient(): S3Client {
  if (cachedClient) {
    return cachedClient;
  }

  const accountId = requireEnv("R2_ACCOUNT_ID");

  cachedClient = new S3Client({
    region: normalizeR2Region(env.R2_REGION),
    endpoint: getR2Endpoint(accountId),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

  return cachedClient;
}

function getBucketName(area: StorageArea): string {
  if (area === "PRIVATE") {
    return requireEnv("R2_PRIVATE_BUCKET_NAME");
  }

  return env.R2_PUBLIC_BUCKET_NAME || requireEnv("R2_BUCKET_NAME");
}

function encodeCopySource(bucket: string, objectKey: string): string {
  return `/${encodeURIComponent(bucket)}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

export function getObjectCacheControl(area: StorageArea): string {
  return area === "PUBLIC"
    ? "public, max-age=31536000, immutable"
    : "private, no-store, max-age=0";
}

function buildAttachmentDisposition(filename: string): string {
  const asciiFilename = filename
    .replace(/[\r\n]/g, "")
    .replace(/["\\]/g, "_")
    .replace(/[^\x20-\x7E]/g, "_")
    .slice(0, 180) || "download";
  const encodedFilename = encodeURIComponent(filename.replace(/[\r\n]/g, "")).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
}

function toWebStream(body: unknown): ReadableStream<Uint8Array> {
  if (body && typeof body === "object" && "transformToWebStream" in body) {
    return (body as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream();
  }

  if (body instanceof Readable) {
    return Readable.toWeb(body) as ReadableStream<Uint8Array>;
  }

  throw new Error("Unable to stream storage object body.");
}

export function getStorageAreaForGalleryVisibility(visibility: "PUBLIC" | "PRIVATE"): StorageArea {
  return visibility;
}

export async function createSignedUploadUrl(input: SignedUploadInput): Promise<string> {
  const area = input.area ?? "PUBLIC";
  const command = new PutObjectCommand({
    Bucket: getBucketName(area),
    Key: input.objectKey,
    ContentType: input.contentType,
    CacheControl: getObjectCacheControl(area),
    Metadata: input.metadata,
  });

  return getSignedUrl(getClient(), command, {
    expiresIn: input.expiresInSeconds ?? 60 * 15,
  });
}

export async function createMultipartUpload(input: SignedUploadInput): Promise<string> {
  const area = input.area ?? "PUBLIC";
  const response = await getClient().send(
    new CreateMultipartUploadCommand({
      Bucket: getBucketName(area),
      Key: input.objectKey,
      ContentType: input.contentType,
      CacheControl: getObjectCacheControl(area),
      Metadata: input.metadata,
    }),
  );

  if (!response.UploadId) throw new Error("Storage did not return a multipart upload ID.");
  return response.UploadId;
}

export async function createSignedMultipartPartUrl(input: {
  area: StorageArea;
  objectKey: string;
  uploadId: string;
  partNumber: number;
  expiresInSeconds?: number;
}): Promise<string> {
  return getSignedUrl(
    getClient(),
    new UploadPartCommand({
      Bucket: getBucketName(input.area),
      Key: input.objectKey,
      UploadId: input.uploadId,
      PartNumber: input.partNumber,
    }),
    { expiresIn: input.expiresInSeconds ?? 60 * 20 },
  );
}

export async function listMultipartParts(input: {
  area: StorageArea;
  objectKey: string;
  uploadId: string;
}): Promise<MultipartUploadedPart[]> {
  const parts: MultipartUploadedPart[] = [];
  let partNumberMarker: string | undefined;

  do {
    const response = await getClient().send(
      new ListPartsCommand({
        Bucket: getBucketName(input.area),
        Key: input.objectKey,
        UploadId: input.uploadId,
        PartNumberMarker: partNumberMarker,
      }),
    );

    for (const part of response.Parts ?? []) {
      if (part.PartNumber && part.ETag && part.Size !== undefined) {
        parts.push({ partNumber: part.PartNumber, etag: part.ETag, sizeBytes: part.Size });
      }
    }

    partNumberMarker = response.IsTruncated ? response.NextPartNumberMarker : undefined;
  } while (partNumberMarker);

  return parts.sort((left, right) => left.partNumber - right.partNumber);
}

export async function completeMultipartUpload(input: {
  area: StorageArea;
  objectKey: string;
  uploadId: string;
  parts: MultipartUploadedPart[];
}): Promise<void> {
  await getClient().send(
    new CompleteMultipartUploadCommand({
      Bucket: getBucketName(input.area),
      Key: input.objectKey,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: input.parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber })),
      },
    }),
  );
}

export async function abortMultipartUpload(input: {
  area: StorageArea;
  objectKey: string;
  uploadId: string;
}): Promise<void> {
  await getClient().send(
    new AbortMultipartUploadCommand({
      Bucket: getBucketName(input.area),
      Key: input.objectKey,
      UploadId: input.uploadId,
    }),
  );
}

export async function createSignedDownloadUrl(input: SignedDownloadInput): Promise<string> {
  const area = input.area ?? "PUBLIC";
  const command = new GetObjectCommand({
    Bucket: getBucketName(area),
    Key: input.objectKey,
    ResponseContentDisposition: input.downloadFilename
      ? buildAttachmentDisposition(input.downloadFilename)
      : undefined,
  });

  return getSignedUrl(getClient(), command, {
    expiresIn: input.expiresInSeconds ?? 60 * 5,
  });
}

export async function uploadObject(input: UploadObjectInput): Promise<void> {
  const area = input.area ?? "PUBLIC";
  const command = new PutObjectCommand({
    Bucket: getBucketName(area),
    Key: input.objectKey,
    ContentType: input.contentType,
    CacheControl: getObjectCacheControl(area),
    Metadata: input.metadata,
    Body: input.body,
  });

  await getClient().send(command);
}

export async function headObject(objectKey: string, area: StorageArea): Promise<StorageObjectMetadata> {
  const response = await getClient().send(
    new HeadObjectCommand({
      Bucket: getBucketName(area),
      Key: objectKey,
      ChecksumMode: "ENABLED",
    }),
  );

  return {
    contentLength: response.ContentLength ?? null,
    contentType: response.ContentType ?? null,
    checksumSha256: response.ChecksumSHA256 ?? null,
    etag: response.ETag ?? null,
    metadata: response.Metadata ?? {},
  };
}

export async function copyObject(input: CopyObjectInput): Promise<void> {
  const bucket = getBucketName(input.area);

  await getClient().send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: input.destinationObjectKey,
      CopySource: encodeCopySource(bucket, input.sourceObjectKey),
      ContentType: input.contentType,
      CacheControl: getObjectCacheControl(input.area),
      MetadataDirective: "REPLACE",
      Metadata: input.metadata,
    }),
  );
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];

    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (body && typeof body === "object" && "transformToByteArray" in body) {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }

  throw new Error("Unable to read storage object body.");
}

export async function getObjectBuffer(objectKey: string, area: StorageArea = "PUBLIC"): Promise<Buffer> {
  const response = await getClient().send(new GetObjectCommand({
    Bucket: getBucketName(area),
    Key: objectKey,
  }));

  return streamToBuffer(response.Body);
}

export async function getObjectStream(objectKey: string, area: StorageArea): Promise<StorageObjectStream> {
  const response = await getClient().send(new GetObjectCommand({
    Bucket: getBucketName(area),
    Key: objectKey,
  }));

  return {
    body: toWebStream(response.Body),
    contentLength: response.ContentLength ?? null,
    contentType: response.ContentType ?? null,
    etag: response.ETag ?? null,
  };
}

export async function deleteObjectByKey(objectKey: string, area: StorageArea = "PUBLIC"): Promise<void> {
  await getClient().send(new DeleteObjectCommand({
    Bucket: getBucketName(area),
    Key: objectKey,
  }));
}

export function buildPublicAssetUrl(objectKey: string): string {
  const baseUrl = requireEnv("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  return `${baseUrl}/${objectKey}`;
}
