import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

function includesAll(source, fragments, label) {
  const missing = fragments.filter((fragment) => !source.includes(fragment));
  if (missing.length > 0) throw new Error(`${label} is missing: ${missing.join(", ")}`);
}

function excludesAll(source, fragments, label) {
  const found = fragments.filter((fragment) => source.includes(fragment));
  if (found.length > 0) throw new Error(`${label} contains forbidden values: ${found.join(", ")}`);
}

const [
  siteHeader,
  styles,
  contactForm,
  bookingForm,
  lightbox,
  publicMosaic,
  galleryGrid,
  assetManager,
  assetUpload,
  archiveUpload,
  checkpoint,
  storage,
  uploadSessions,
  schema,
  migration,
  uploadValidation,
] = await Promise.all([
  read("src/components/site-header.tsx"),
  read("src/app/globals.css"),
  read("src/components/contact-form.tsx"),
  read("src/components/booking-form.tsx"),
  read("src/components/gallery-lightbox-overlay.tsx"),
  read("src/components/public-gallery-mosaic.tsx"),
  read("src/components/gallery-lightbox.tsx"),
  read("src/components/admin-asset-manager.tsx"),
  read("src/components/admin-asset-upload.tsx"),
  read("src/components/admin-archive-upload.tsx"),
  read("src/lib/resumable-upload.ts"),
  read("src/server/services/storage.ts"),
  read("src/server/services/media-upload-sessions.ts"),
  read("prisma/schema.prisma"),
  read("prisma/migrations/20260731190000_phase4_resumable_uploads/migration.sql"),
  read("src/server/security/upload-validation.ts"),
]);

includesAll(siteHeader, ["aria-expanded", "aria-modal", "Escape", "event.key === \"Tab\"", "mobile-drawer-close"], "mobile navigation");
includesAll(styles, ["overflow-x: clip", "env(safe-area-inset-top)", "@media (pointer: coarse)", "prefers-reduced-motion", "min-height: 2.75rem"], "mobile CSS");
includesAll(contactForm, ["<label", 'type="tel"', 'autoComplete="email"', 'role="alert"'], "contact form accessibility");
includesAll(bookingForm, ["<label", 'type="tel"', 'inputMode="numeric"', 'role="alert"'], "booking form accessibility");
includesAll(lightbox, ["isMobile", "closeOnPullDown", "useReducedMotion", "hidden: isMobile"], "mobile lightbox");
includesAll(publicMosaic, ["returnFocusRef", "requestAnimationFrame"], "public lightbox focus return");
includesAll(galleryGrid, ["returnFocusRef", "requestAnimationFrame"], "private lightbox focus return");
includesAll(assetManager, [">Earlier</button>", ">Later</button>", "event.altKey", 'event.key !== "ArrowUp"', "Delete permanently", "Move to Bin"], "admin touch and keyboard controls");
includesAll(assetUpload, ["MAX_PARALLEL_PHOTO_UPLOADS", "withUploadRetries", "beforeunload", "Pause Uploads", "HEIC/HEIF", "findUploadCheckpoint"], "resumable photo upload");
includesAll(archiveUpload, ["MAX_PARALLEL_MULTIPART_PARTS", "multipart/part-url", "multipart/complete", "Pause Upload", "Cancel & Discard Parts", "findUploadCheckpoint"], "resumable archive upload");
includesAll(checkpoint, ["CHECKPOINT_VERSION", "CHECKPOINT_MAX_AGE_MS", "runBounded", "uploadBlobWithProgress", "MAX_UPLOAD_RETRIES"], "browser upload checkpointing");
excludesAll(checkpoint, ["filename", "objectKey", "uploadUrl", "password", "token"], "browser checkpoint storage");
includesAll(storage, ["CreateMultipartUploadCommand", "UploadPartCommand", "ListPartsCommand", "CompleteMultipartUploadCommand", "AbortMultipartUploadCommand"], "multipart storage service");
includesAll(uploadSessions, ["prepareArchiveMultipartUpload", "getArchiveMultipartPartUrl", "completeArchiveMultipartSession", "abortArchiveMultipartSession", "Promise.allSettled"], "multipart session ownership");
includesAll(schema, ["multipartUploadId", "multipartPartSizeBytes", "multipartStartedAt", "ABORTED"], "Phase 4 Prisma schema");
includesAll(migration, ["MediaUploadSession", "multipartUploadId", "ABORTED"], "Phase 4 migration");
includesAll(uploadValidation, ["HEIC and HEIF are not accepted", 'extension === "heic"'], "explicit HEIC policy");

const multipartRoutes = [
  "prepare",
  "part-url",
  "complete",
  "abort",
];
for (const route of multipartRoutes) {
  const source = await read(`src/app/admin/actions/galleries/uploads/multipart/${route}/route.ts`);
  includesAll(source, ["requireAdminRequestSession", "verifyMutationProtection", '"Cache-Control"'], `${route} multipart route`);
}

console.log("Phase 4 verification passed (mobile navigation/forms/lightbox, accessible admin controls, and resumable uploads)." );
