const HASH_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

export async function sha256File(file: File, onProgress?: (percent: number) => void): Promise<string> {
  const { createSHA256 } = await import("hash-wasm");
  const hasher = await createSHA256();
  hasher.init();

  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_SIZE_BYTES) {
    const chunk = new Uint8Array(await file.slice(offset, offset + HASH_CHUNK_SIZE_BYTES).arrayBuffer());
    hasher.update(chunk);
    onProgress?.(Math.min(100, Math.round(((offset + chunk.byteLength) / file.size) * 100)));
  }

  return hasher.digest("hex");
}
