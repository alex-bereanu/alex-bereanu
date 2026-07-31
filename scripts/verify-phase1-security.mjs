import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

async function source(path) {
  return readFile(resolve(root, path), "utf8");
}

function includesAll(value, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(value.includes(fragment), `${label} is missing: ${fragment}`);
  }
}

function excludesAll(value, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(!value.includes(fragment), `${label} still contains: ${fragment}`);
  }
}

const [
  packageJsonText,
  envSource,
  proxySource,
  nextConfigSource,
  galleryPageSource,
  privateMediaSource,
  galleryAccessSource,
  shareRouteSource,
  adminSessionSource,
  storageSource,
  migrationSource,
  assetDeleteSource,
  galleryDeleteSource,
  archiveDeleteSource,
] = await Promise.all([
  source("package.json"),
  source("src/config/env.ts"),
  source("src/proxy.ts"),
  source("next.config.ts"),
  source("src/app/g/[slug]/page.tsx"),
  source("src/app/api/gallery-media/assets/[assetId]/[variant]/route.ts"),
  source("src/server/services/gallery-access.ts"),
  source("src/app/admin/actions/galleries/share-link/route.ts"),
  source("src/server/auth/admin-session.ts"),
  source("src/server/services/storage.ts"),
  source("prisma/migrations/20260731090000_phase1_security/migration.sql"),
  source("src/app/admin/actions/galleries/assets-delete/route.ts"),
  source("src/app/admin/actions/galleries/delete/route.ts"),
  source("src/app/admin/actions/galleries/archive-delete/route.ts"),
]);

const packageJson = JSON.parse(packageJsonText);
assert.match(packageJson.dependencies.next, /16\.2\.12/, "Next.js must remain on the patched Phase 1 baseline");
assert.match(packageJson.dependencies.sharp, /0\.35\.3/, "Sharp must remain on the patched direct dependency baseline");
assert.match(packageJson.dependencies["@prisma/client"], /7\.9\.1/, "Prisma Client must remain on the patched Phase 1 baseline");

includesAll(
  envSource,
  ["OAUTH_STATE_SECRET", "GALLERY_ACCESS_SECRET", "CSRF_SECRET", "R2_PRIVATE_BUCKET_NAME"],
  "environment schema",
);
excludesAll(envSource, ["ADMIN_PASSWORD_PLAIN", "ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET"], "environment schema");

includesAll(
  proxySource,
  ['"Cache-Control", "private, no-store, max-age=0"', '"Referrer-Policy", "no-referrer"', "noarchive"],
  "private response policy",
);
assert.ok(!proxySource.includes("server/auth/admin-session"), "Proxy must not bundle Prisma-backed session verification");

includesAll(nextConfigSource, ['search: ""', "unoptimized: true", "maximumRedirects: 0", "maximumResponseBody"], "image optimizer policy");
assert.ok(!nextConfigSource.includes('hostname: "**"'), "Image optimizer must not allow wildcard hosts");

includesAll(
  galleryPageSource,
  ["/api/gallery-media/assets/", "disableOptimization", "Originals are never used as a preview fallback"],
  "private gallery page",
);
excludesAll(galleryPageSource, ["R2_PUBLIC_BASE_URL", "storageKey}"], "private gallery page");

includesAll(
  privateMediaSource,
  ["resolveGalleryAccessFromCookie", 'getObjectStream(objectKey, "PRIVATE")', '"Cache-Control": "private, no-store, max-age=0"'],
  "private media route",
);
includesAll(
  galleryAccessSource,
  ['visibility: "PRIVATE"', "isActive: true", "grantVersion", "tokenHash: { not: null }"],
  "gallery authorization DAL",
);

includesAll(
  shareRouteSource,
  ["createGalleryShareCapability", "tokenHash: capability.tokenHash", "DEFAULT_SHARE_LIFETIME_MS", "password: undefined"],
  "share capability creation",
);
assert.ok(!shareRouteSource.includes("slug: galleryUrl"), "Recoverable gallery capability must not be persisted");

includesAll(
  adminSessionSource,
  ["randomBytes(32)", "hashSessionToken", "prisma.adminSession", "revokedAt", "isSessionPrincipalActive"],
  "admin session store",
);
includesAll(
  storageSource,
  ["R2_PRIVATE_BUCKET_NAME", 'area === "PRIVATE"', '"private, no-store, max-age=0"'],
  "storage boundary",
);

includesAll(
  migrationSource,
  ['UPDATE "GalleryShareLink"', '"isActive" = FALSE', 'WHERE "tokenHash" IS NULL', 'CREATE TABLE "StorageDeletionJob"'],
  "security migration",
);
for (const [label, routeSource] of [
  ["asset deletion", assetDeleteSource],
  ["gallery deletion", galleryDeleteSource],
  ["archive deletion", archiveDeleteSource],
]) {
  includesAll(routeSource, ["enqueueStorageDeletions", "attemptStorageDeletions", "prisma.$transaction"], label);
}

console.log("Phase 1 static security verification passed (private boundary, authorization, sessions, sharing, and deletion outbox).\n");
