export type ResolvedByteRange = {
  complete: boolean;
  end: bigint;
  start: bigint;
  value?: string;
};

export function parseSingleByteRange(value: string | null, size: bigint): ResolvedByteRange | null {
  if (size <= BigInt(0)) return null;

  const last = size - BigInt(1);
  if (!value) return { complete: true, start: BigInt(0), end: last };

  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;

  let start: bigint;
  let end: bigint;
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix <= BigInt(0)) return null;
    start = suffix >= size ? BigInt(0) : size - suffix;
    end = last;
  } else {
    start = BigInt(match[1]);
    end = match[2] ? BigInt(match[2]) : last;
  }

  if (start > end || start > last) return null;
  if (end > last) end = last;

  return {
    complete: start === BigInt(0) && end === last,
    end,
    start,
    value: `bytes=${start}-${end}`,
  };
}
