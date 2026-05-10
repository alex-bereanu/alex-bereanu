const slugRegex = /[^a-z0-9-]/g;

export function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(slugRegex, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function withRandomSuffix(prefix: string): string {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  return `${prefix}-${suffix}`;
}
