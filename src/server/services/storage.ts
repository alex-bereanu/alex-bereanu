import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env, requireEnv } from "@/config/env";

type SignedUploadInput = {
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
};

type SignedDownloadInput = {
  objectKey: string;
  expiresInSeconds?: number;
  downloadFilename?: string;
};

type UploadObjectInput = {
  objectKey: string;
  contentType: string;
  body: Buffer;
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

  if (regionCodeMatch?.[1]) {
    return regionCodeMatch[1].toLowerCase();
  }

  console.warn(`Invalid R2_REGION value "${trimmed}". Falling back to "auto".`);
  return "auto";
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

export async function createSignedUploadUrl(input: SignedUploadInput): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: requireEnv("R2_BUCKET_NAME"),
    Key: input.objectKey,
    ContentType: input.contentType,
  });

  return getSignedUrl(getClient(), command, {
    expiresIn: input.expiresInSeconds ?? 60 * 15,
  });
}

export async function createSignedDownloadUrl(input: SignedDownloadInput): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: requireEnv("R2_BUCKET_NAME"),
    Key: input.objectKey,
    ResponseContentDisposition: input.downloadFilename
      ? `attachment; filename=\"${input.downloadFilename}\"`
      : undefined,
  });

  return getSignedUrl(getClient(), command, {
    expiresIn: input.expiresInSeconds ?? 60 * 15,
  });
}

export async function uploadObject(input: UploadObjectInput): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: requireEnv("R2_BUCKET_NAME"),
    Key: input.objectKey,
    ContentType: input.contentType,
    Body: input.body,
  });

  await getClient().send(command);
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

export async function getObjectBuffer(objectKey: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: requireEnv("R2_BUCKET_NAME"),
    Key: objectKey,
  });
  const response = await getClient().send(command);

  return streamToBuffer(response.Body);
}

export async function deleteObjectByKey(objectKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: requireEnv("R2_BUCKET_NAME"),
    Key: objectKey,
  });

  await getClient().send(command);
}

export function buildPublicAssetUrl(objectKey: string): string {
  const baseUrl = requireEnv("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  return `${baseUrl}/${objectKey}`;
}
