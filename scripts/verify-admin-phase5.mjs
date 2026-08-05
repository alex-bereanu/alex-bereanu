import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const { parseSingleByteRange } = await import("../src/lib/http-byte-range.ts");

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

function includesAll(source, fragments, label) {
  const missing = fragments.filter((fragment) => !source.includes(fragment));
  if (missing.length > 0) throw new Error(`${label} is missing: ${missing.join(", ")}`);
}

function excludesAll(source, fragments, label) {
  const found = fragments.filter((fragment) => source.includes(fragment));
  if (found.length > 0) throw new Error(`${label} contains private identifiers: ${found.join(", ")}`);
}

const [
  guard,
  oauth,
  galleryDelete,
  assetPurge,
  archiveDelete,
  confirmButton,
  downloadRoute,
  clientActions,
  telemetryRoute,
  webVitals,
  maintenance,
  css,
  galleryAccess,
  packageJson,
] = await Promise.all([
  read("src/server/auth/admin-guard.ts"),
  read("src/server/auth/admin-google-oauth.ts"),
  read("src/app/admin/actions/galleries/delete/route.ts"),
  read("src/app/admin/actions/galleries/assets-purge/route.ts"),
  read("src/app/admin/actions/galleries/archive-delete/route.ts"),
  read("src/components/confirm-submit-button.tsx"),
  read("src/app/api/galleries/[slug]/assets/[assetId]/download/route.ts"),
  read("src/components/client-photo-actions.tsx"),
  read("src/app/api/telemetry/client-delivery/route.ts"),
  read("src/components/web-vitals-reporter.tsx"),
  read("src/server/services/operational-maintenance.ts"),
  read("src/app/globals.css"),
  read("src/server/services/gallery-access.ts"),
  read("package.json"),
]);

includesAll(guard, ["requireRecentAdminRequestSession", "ADMIN_STEP_UP_MAX_AGE_SECONDS", 'status: 428', "reauthenticationUrl", "adminReturnPath", 'refererUrl.origin !== requestUrl.origin', 'refererUrl.pathname.startsWith("/admin/actions/")'], "recent-auth guard");
includesAll(oauth, ['prompt", forceReauthentication ? "login"', '"max_age", "0"'], "Google step-up OAuth");
for (const [source, label] of [[galleryDelete, "gallery deletion"], [assetPurge, "asset purge"], [archiveDelete, "archive deletion"]]) {
  includesAll(source, ["requireRecentAdminRequestSession", "recordSecurityAuditEvent"], label);
}
includesAll(confirmButton, ["confirmButtonRef.current?.focus()", 'event.key === "Escape"', "15_000", 'aria-live="polite"'], "destructive confirmation control");

assert.deepEqual(parseSingleByteRange(null, 100n), { complete: true, start: 0n, end: 99n });
assert.deepEqual(parseSingleByteRange("bytes=0-99", 100n), { complete: true, start: 0n, end: 99n, value: "bytes=0-99" });
assert.deepEqual(parseSingleByteRange("bytes=25-", 100n), { complete: false, start: 25n, end: 99n, value: "bytes=25-99" });
assert.deepEqual(parseSingleByteRange("bytes=-10", 100n), { complete: false, start: 90n, end: 99n, value: "bytes=90-99" });
assert.equal(parseSingleByteRange("bytes=100-101", 100n), null);
assert.equal(parseSingleByteRange("bytes=0-1,4-5", 100n), null);

includesAll(downloadRoute, ["parseSingleByteRange", "Accept-Ranges", "export async function HEAD", "integrity_mismatch", "storage_error", '"private, no-store'], "resilient original transfer");
includesAll(clientActions, ["AbortController", "response.body.getReader()", "Cancel preparation", "Math.round(progress * 100)", "reportClientDelivery"], "client transfer recovery");
includesAll(telemetryRoute, ["eventSchema", "buildRateLimitKey", 'routeGroup: "/g/[private]"', 'kind: "client-delivery"'], "private delivery telemetry");
excludesAll(telemetryRoute, ["assetId", "galleryId", "filename", "token", "slug", "email"], "private delivery telemetry");
includesAll(webVitals, ['pathname.startsWith("/admin")', 'return "/admin"'], "Admin Web Vitals grouping");
includesAll(maintenance, ["DELIVERY_LOG_RETENTION_DAYS", "isAdminClientDeliveryPhase4Enabled", "oldestPendingMediaJobAgeSeconds", "oldDeliveryLogs"], "retention and queue-delay telemetry");
includesAll(css, ["content-visibility: auto", "contain-intrinsic-size", "env(safe-area-inset-left)", "prefers-reduced-motion", "min-height: 2.75rem"], "long-gallery and mobile accessibility styles");
includesAll(galleryAccess, ["PRIVATE_GALLERY_PAGE_SIZE + 1", "take: PRIVATE_GALLERY_PAGE_SIZE + 1"], "bounded private gallery pagination");
includesAll(packageJson, ["admin:phase5:verify", "release:verify"], "Phase 5 release gate");

console.log("Admin Phase 5 verification passed (step-up deletion controls, audit coverage, resilient transfers, private telemetry, retention, accessibility, and bounded long galleries).");
