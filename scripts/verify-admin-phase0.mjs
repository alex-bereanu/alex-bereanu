import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = process.cwd();

async function source(path) {
  return readFile(resolve(root, path), "utf8");
}

async function routeFiles(directory) {
  const results = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await routeFiles(entryPath));
    if (entry.isFile() && entry.name === "route.ts") results.push(entryPath);
  }

  return results;
}

function includesAll(value, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(value.includes(fragment), `${label} is missing: ${fragment}`);
  }
}

const adminActionRoutes = await routeFiles(resolve(root, "src/app/admin/actions"));
let protectedPostRoutes = 0;

for (const routePath of adminActionRoutes) {
  const routeSource = await readFile(routePath, "utf8");
  if (!routeSource.includes("export async function POST")) continue;

  protectedPostRoutes += 1;
  assert.ok(
    /require(?:Recent)?AdminRequestSession|requireAdminRequestSessionDetails/.test(routeSource),
    `${routePath} must authenticate inside the POST route`,
  );

  const isDisabledArchiveRelay = routePath.endsWith(join("archive-upload", "route.ts"));
  if (!isDisabledArchiveRelay) {
    assert.ok(
      routeSource.includes("verifyMutationProtection"),
      `${routePath} must verify CSRF and request origin`,
    );
  } else {
    includesAll(routeSource, ['status: 413', "Archive relay uploads are disabled"], "disabled archive relay");
  }
}

assert.ok(protectedPostRoutes >= 25, "Expected the complete Admin mutation route surface");

const [
  originalDownloadSource,
  galleryAccessSource,
  capabilitySource,
  proxySource,
  siteContentUpdateSource,
  assetDeleteSource,
  infrastructureCheckpointSource,
  checkpointRunnerSource,
] = await Promise.all([
  source("src/app/api/galleries/[slug]/assets/[assetId]/download/route.ts"),
  source("src/server/services/gallery-access.ts"),
  source("src/server/auth/gallery-access.ts"),
  source("src/proxy.ts"),
  source("src/app/admin/actions/site-content/update/route.ts"),
  source("src/app/admin/actions/galleries/assets-delete/route.ts"),
  source("scripts/verify-admin-phase0-infrastructure.mjs"),
  source("scripts/verify-admin-phase0-checkpoint.mjs"),
]);

includesAll(
  originalDownloadSource,
  [
    "resolveGalleryAccessFromCookie",
    "galleryCapabilityMatchesAccess",
    "galleryId: access.galleryId",
    'status: "READY"',
    "sourceStorageArea",
    "createSignedDownloadUrl",
    "expiresInSeconds: 60 * 2",
  ],
  "private original route",
);
includesAll(
  galleryAccessSource,
  [
    'visibility: "PRIVATE"',
    "isActive: true",
    "grantVersion",
    "tokenHash: { not: null }",
    '"downloadCount" = "downloadCount" + 1',
  ],
  "gallery authorization service",
);
includesAll(
  capabilitySource,
  ["randomBytes(32)", "hashGalleryCapabilityToken", 'TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/'],
  "gallery capability protection",
);
includesAll(
  proxySource,
  [
    'pathname.startsWith("/api/galleries/")',
    '"Cache-Control", "private, no-store, max-age=0"',
    '"Referrer-Policy", "no-referrer"',
    "noarchive",
  ],
  "private response policy",
);
includesAll(
  siteContentUpdateSource,
  [
    "requireAdminRequestSession",
    "verifyMutationProtection",
    "allowedContentKeys",
    "validateImageFileSignature",
    "prepareSiteContentImageVariants",
    "enqueueStorageDeletions",
  ],
  "site content mutation",
);
includesAll(
  assetDeleteSource,
  ["requireAdminRequestSession", "verifyMutationProtection", "enqueueStorageDeletions", "prisma.$transaction"],
  "asset deletion mutation",
);
includesAll(
  infrastructureCheckpointSource,
  [
    "sslmode",
    "verify-full",
    "tlsStream.encrypted",
    "tlsStream.authorized",
    "PHASE0_RESTORE_DATABASE_URL",
    "PHASE0_BACKUP_ENCRYPTED",
    "PHASE0_RESTORE_ISOLATED",
    "PHASE0_STORAGE_RESTORE_VERIFIED",
    "PHASE0_SYNTHETIC_AUTHORIZATION_VERIFIED",
    "PHASE0_IOS_SAVE_VERIFIED",
    "PHASE0_ANDROID_SAVE_VERIFIED",
    "idDigest",
  ],
  "fail-closed infrastructure checkpoint",
);
includesAll(
  checkpointRunnerSource,
  [
    ".env.phase0.local",
    "scripts/verify-production-config.mjs",
    "scripts/verify-admin-phase0-infrastructure.mjs",
  ],
  "Phase 0 checkpoint runner",
);

console.log(
  `Admin Phase 0 static security verification passed (${protectedPostRoutes} authenticated POST routes, private original authorization, content validation, deletion outbox, and fail-closed infrastructure gate).`,
);
