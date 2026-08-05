import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const source = (path) => readFile(resolve(root, path), "utf8");

function includesAll(value, fragments, label) {
  for (const fragment of fragments) assert.ok(value.includes(fragment), `${label} is missing: ${fragment}`);
}

const paths = {
  schema: "prisma/schema.prisma",
  migration: "prisma/migrations/20260804213000_admin_phase3_content_revisions/migration.sql",
  env: ".env.example",
  registry: "src/lib/site-content-registry.ts",
  content: "src/server/services/site-content.ts",
  revisions: "src/server/services/site-content-revisions.ts",
  draft: "src/app/admin/actions/site-content/draft/route.ts",
  publish: "src/app/admin/actions/site-content/publish/route.ts",
  restore: "src/app/admin/actions/site-content/restore/route.ts",
  legacyUpdate: "src/app/admin/actions/site-content/update/route.ts",
  privateMedia: "src/app/admin/pages/media/[revisionId]/[variant]/route.ts",
  editor: "src/app/admin/_components/admin-content-revision-editor.tsx",
  editorPage: "src/app/admin/pages/[key]/page.tsx",
  pages: "src/app/admin/pages/page.tsx",
  preview: "src/app/admin/pages/[key]/preview/page.tsx",
  cache: "src/server/services/public-cache.ts",
  styles: "src/app/globals.css",
};

const files = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await source(path)])));

includesAll(files.schema, ["enum SiteContentRevisionStatus", "model SiteContentRevision", "publishedPayload", "publishedRevisionId", "imageFocalX", "seoDescription", "@@unique([contentKey, version])"], "Phase 3 schema");
includesAll(files.migration, ["CREATE TYPE \"SiteContentRevisionStatus\"", "CREATE TABLE \"SiteContentRevision\"", "jsonb_strip_nulls", "legacy-' || md5", "SiteContentRevision_contentKey_fkey", "SiteContent_imageFocalX_range"], "additive Phase 3 migration");
includesAll(files.env, ['ADMIN_CONTENT_PHASE3_ENABLED="false"', "DIRECT_DATABASE_URL", "sslmode=verify-full"], "disabled-by-default Phase 3 configuration");

includesAll(files.registry, ["global.brand", "global.navigation", "global.footer", "home.about", '["weddings", "Weddings"', '`portfolio.${slug}`', "weddings.landing", "client.gallery", "normalizeSiteContentPayload", 'kind: "url"', "SEO description"], "typed content inventory");
assert.ok(!files.registry.includes('kind: "html"'), "The typed registry must not accept arbitrary HTML fields.");

for (const key of ["draft", "publish", "restore"]) {
  includesAll(files[key], ["requireAdminRequestSession", "verifyMutationProtection", "isAdminContentPhase3Enabled", "recordSecurityAuditEvent"], `${key} mutation`);
}

includesAll(files.draft, ["preparePrivateSiteContentImageVariants", "SiteContentRevisionStatus.DRAFT", "nextContentRevisionVersion", "TransactionIsolationLevel.Serializable", "payload: payload as Prisma.InputJsonValue"], "immutable private draft save");
assert.ok(!files.draft.includes("invalidateSiteContentKey"), "Saving a draft must not invalidate or change live content.");
includesAll(files.publish, ["getObjectBuffer", 'area: "PUBLIC"', "enqueueStorageDeletions", "attemptStorageDeletions", "publishedPayload", "publishedRevisionId", "invalidateSiteContentKey", "revalidatePath", "content_draft_publish_conflict"], "atomic publish and asset promotion");
includesAll(files.restore, ["createRestoredDraft", "content_restored_as_draft"], "restore-as-draft action");
includesAll(files.legacyUpdate, ["isAdminContentPhase3Enabled", "content_phase3_requires_revision_workflow"], "legacy publish bypass guard");

includesAll(files.privateMedia, ["requireAdminRequestSession", "private, no-store", "imageStorageArea", "X-Robots-Tag"], "private draft media");
includesAll(files.content, ["isAdminContentPhase3Enabled()", "publishedPayload", "getCachedSiteContentRows", "siteContentCacheTag(key)", "getPublicSiteChromeContent", "imageFocalX"], "published content compatibility service");
includesAll(files.cache, ["siteContentCacheTag", "invalidateSiteContentKey", 'revalidateTag(siteContentCacheTag(key), { expire: 0 })'], "targeted content invalidation");
includesAll(files.revisions, ["take: 30", 'distinct: ["contentKey"]', "groupBy", "restoredFromRevisionId"], "bounded revision reads");

includesAll(files.editor, ["beforeunload", "Unsaved changes", "Save as new draft", "Image alt text", "Focal X (0–1)"], "responsive revision editor");
includesAll(files.styles, [".admin-editor-actions", "safe-area-inset-bottom"], "mobile-safe draft action bar");
includesAll(files.editorPage, ["Compare with live", "Revision history", "Publish revision", "Restore as draft", "Preview draft"], "revision workspace");
includesAll(files.pages, ["Draft v", "Published v", "revisionCount", "Defaults live"], "Pages status list");
includesAll(files.preview, ["requireAdminPageSession", "robots", "index: false", "Private draft preview"], "authenticated content preview");

console.log("Admin Phase 3 static verification passed (typed inventory, private immutable drafts, explicit publish, targeted invalidation, history, preview, and rollback).");
