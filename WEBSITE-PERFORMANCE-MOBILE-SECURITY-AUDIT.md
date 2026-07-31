# Website Performance, Mobile, and Security Audit

**Project:** Alex Bereanu photography website  
**Repository:** `E:\github\alex-bereanu`  
**Audit performed:** 13 July 2026  
**Report exported:** 14 July 2026  
**Status:** Original audit complete; Phases 1, 2, 3, 4, and 5 have since been implemented locally

> **Implementation update (31 July 2026):** This document preserves the original findings and plan. Phase 1 is recorded in `PHASE-1-SECURITY-CHECKPOINT.md`; the approved image-pipeline migration is recorded in `PHASE-2-IMAGE-PIPELINE-MIGRATION.md`; server, payload, and browser performance work is recorded in `PHASE-3-PERFORMANCE-MIGRATION.md`; mobile functionality plus resumable uploads are recorded in `PHASE-4-MOBILE-UPLOAD-RESILIENCE.md`; and operational security, monitoring, retention, and release gates are recorded in `PHASE-5-OPERATIONS-SECURITY.md`. No production database, R2, provider-policy, cleanup, or backup mutation was performed during these implementation tasks. The live deployment and external penetration-test gates still apply.

## 1. Prompts and project instructions

### Repository instruction supplied with the task

```text
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
```

### Original audit request

> look at the the current website implementation and create a plan on how we can continue to develop it into a better version. Focus on improving image loading and overall performance of the website. UI looks good for now, but also take into consideration mobile functionality and performance. Security must also be key, as it will hold valuable personal photos. Before starting to implement the plan, let me review it and we can decide on the best approach. Consider all the relevant skills that you might need in developing the plan.

### Follow-up implementation prompts

> output all audit as a markdown file and make sure to include my prompt

> sounds good, let's implement Phase 1, including the security verification checkpoint before beginning the image pipeline migration

> looks good, continue with the rest of migration

> continue with phase 3

> continue with phase 4

> great, continue with phase 5


## 2. Executive summary

The application has a good technical foundation, but it is not yet ready to hold valuable private client galleries safely.

The most important release blocker is the private-media boundary. The gallery page requires authorization, but the preview images rendered by that page are built from the public R2 base URL. Anyone who obtains one of those URLs can potentially continue loading the image without the gallery password and after a share link is expired, deactivated, or revoked.

The image pipeline also creates a significant cold-cache performance risk. Variant generation is best-effort request work, failures are not durably retried, and missing variants fall back to the original upload. A single large source photo can therefore be fetched and transformed during a visitor request. The current pages then compound this by assigning eager or high fetch priority to many images simultaneously.

The recommended direction is:

1. Separate public portfolio derivatives from all private client media.
2. Deliver private previews through an authenticated edge layer in front of a private R2 bucket.
3. Generate responsive, versioned derivatives through a durable processing queue.
4. Never use an original upload as a preview fallback.
5. Paginate galleries at the database boundary and defer interaction-only JavaScript.
6. Patch the current Next.js security advisories before release.
7. Add revocable administration and gallery sessions, reliable deletion, audit events, retention rules, and production monitoring.

No application code, configuration, database schema, or existing user-owned files were changed during this audit.

## 3. Audit scope and methodology

The audit covered:

- Next.js App Router architecture and route rendering behavior.
- React Server Component and Client Component boundaries.
- Image upload, transformation, storage, selection, caching, and delivery.
- Homepage, category, public-gallery, and private-gallery rendering.
- Mobile layout, image request behavior, lightbox behavior, forms, and administration.
- Database query scale and gallery payload growth.
- Authentication, share links, authorization, CSRF, rate limiting, and security headers.
- Upload validation, deletion, retention, operational privacy, and dependency risk.
- Production compilation and a production-style mobile browser run.

### Guidance and skills applied

- The bundled Next.js 16.2.1 documentation under `node_modules/next/dist/docs/` was read before making Next.js recommendations, as required by the repository instructions.
- Next.js architecture and current-version best-practice guidance was applied to routing, caching, images, security, and Server Component boundaries.
- React and Next.js performance guidance was applied to bundle splitting, request priorities, rendering, and data loading.
- Web-interface and accessibility guidance was applied to mobile navigation, touch targets, forms, focus behavior, and reduced motion.
- A controlled in-app browser run was used to inspect the mobile DOM and cold image-loading behavior.
- Separate image/performance, mobile/runtime, and security review passes were reconciled into this report.

The existing UI visual direction was intentionally left out of scope. The mobile recommendations preserve the current visual design while fixing functional and performance problems.

## 4. Current architecture

### Application stack

- Next.js 16.2.1 App Router.
- React 19.2.4.
- Prisma 6.6 with Neon Postgres.
- Cloudflare R2 through the AWS SDK.
- Sharp 0.34.5 for image processing.
- `next/image` for grids and covers.
- React Photo Album and Yet Another React Lightbox for galleries.
- Resend for email.
- JSON Web Tokens through `jose` for admin and gallery sessions.
- Turnstile, Zod, bcrypt, CSRF checks, and application rate limiting.
- Vercel-oriented production deployment.

### Current media flow

1. An administrator requests a presigned R2 upload URL.
2. The browser uploads an original directly to R2.
3. The browser calls a finalization route with object metadata.
4. Request-bound `after()` work uses Sharp to generate:
   - a 480px, quality-72 WebP;
   - a 1600px, quality-80 WebP.
5. Gallery data uses the 480px variant as the canonical small image.
6. If a variant is missing, gallery and site-content DTOs fall back to the original object.
7. Public and private gallery previews are currently constructed using the configured public R2 base URL.

### Existing strengths to preserve

- Sensitive admin handlers independently recheck admin authorization.
- CSRF protection combines a signed token with same-origin checks.
- Google OAuth uses state, nonce, and PKCE verification.
- Authentication cookies use `HttpOnly`, production `Secure`, and `SameSite=Strict`.
- Passwords are hashed with bcrypt.
- Request bodies are generally validated with Zod.
- Original downloads are routed through gallery-scoped lookup and short-lived signed redirects.
- Download counters use an atomic database update.
- Direct-to-R2 uploads avoid routing every original through the application server.
- Images generally include dimensions, which helps avoid layout shift.
- A variant concept already exists, giving the new processing pipeline a migration path.

## 5. Verification results

| Check | Result | Notes |
|---|---|---|
| `npm run lint` | Passed | No lint errors found. |
| `npm run typecheck` | Passed | No TypeScript errors found. |
| `npm run build` | Passed | Completed when the environment could reach Neon. The first restricted attempt exposed that build-time rendering depends on database availability. |
| `npm audit --omit=dev` | Failed | Reported 12 vulnerable production packages: 6 high and 6 moderate. |
| Git/source status | Unchanged | No tracked source changes were made; pre-existing untracked files were preserved. |

### Production-style mobile observation

At a 390-by-844 viewport:

- The homepage mounted 41 images in the DOM.
- 20 images used eager loading.
- 10 images used high fetch priority.
- The document did not have global horizontal overflow.
- On the cold run, after approximately five seconds, eight image requests had failed and the remaining images were still pending.
- A sampled missing-variant request used an approximately 13.0MB original JPEG as the optimizer source.
- Once the cold transform completed, Next.js produced an approximately 36.6KB response.
- That single cold transform took approximately 4.1 seconds locally.
- The source R2 response did not declare a `Cache-Control` policy.
- A subsequent warm request was much faster, demonstrating that warm caches can conceal the cold-start problem.

This is a diagnostic run rather than a production field measurement. It nevertheless confirms that missing variants and excessive request priority can create a severe cold-cache loading failure.

## 6. Findings by priority

### 6.1 Critical: private preview media bypasses gallery authorization

### Evidence

- `src/app/g/[slug]/page.tsx:104-118`
- `src/server/services/public-gallery.ts:94-145`
- `src/server/services/storage.ts:152-155`
- `.env.example:40`

The protected gallery page creates preview URLs from `R2_PUBLIC_BASE_URL` and passes them to Client Components and `next/image` after the page-level password check.

### Impact

- A copied preview URL can outlive logout, password changes, expiry, and share-link revocation.
- Password and download limits protect the page and download route, not the known preview object.
- Object paths contain gallery and filename-derived information, making the media namespace less opaque.
- A public Next image-optimizer URL may also remain cached after the underlying gallery is revoked.
- A legitimate signed archive redirect may expose an object key that is unsafe if the same bucket is publicly addressable.

### Required action

- Put private previews, originals, and archives in a bucket/origin with no public development or custom-domain access.
- Place an authenticated edge gateway in front of private derivatives.
- Keep authorization at every media request, not only the gallery page.
- Never pass protected media through the public Next.js image optimizer.
- Use pre-generated derivatives and direct authenticated delivery for private media.

### 6.2 High: the 31-day Next image cache conflicts with revocation and erasure

### Evidence

- `next.config.ts:20-23`
- `src/components/gallery-lightbox.tsx:202-215`
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md:774-802`

`minimumCacheTTL` is configured for 31 days. The bundled Next.js documentation states that optimized-image cache expiry uses the larger applicable TTL and that the cache has no direct invalidation mechanism.

### Impact

A known optimized URL may continue serving a deleted or revoked private image. This conflicts with privacy deletion, client revocation, and incident-response requirements.

### Required action

- Reserve long immutable caching for public, versioned derivatives.
- Do not send private images through `/_next/image`.
- Define a short private-media authorization lifetime and a documented revocation bound.

### 6.3 High: gallery deactivation does not stop private delivery

### Evidence

- `prisma/schema.prisma:62-63`
- `src/app/g/[slug]/page.tsx:42-57`
- `src/server/services/gallery-access.ts:21-69`
- `src/server/services/gallery-access.ts:77-88`

`Gallery.isActive` exists, but private page and download access resolution do not require it.

### Impact

An administrator can deactivate a gallery while its private shares and downloads continue to operate.

### Required action

Create one server-only authorization/data-access layer that atomically checks:

- gallery delivery state;
- share-link state;
- expiry;
- grant or password version;
- recipient/session grant where applicable;
- download quota and concurrency limits.

Every page, preview, original, and archive route must call this layer independently.

### 6.4 High: current Next.js and production dependencies have security advisories

### Evidence

- `package.json:23`
- `package-lock.json:7065-7068`
- Live `npm audit --omit=dev` on 13 July 2026.

The audit found 12 vulnerable production dependency packages: 6 high and 6 moderate. Next.js 16.2.1 is affected by multiple advisories, including App Router Proxy bypasses, Server Component denial of service, cache issues, and image-optimizer denial of service. NPM currently offers Next.js 16.2.10 as the compatible remediation.

Other dependency chains requiring triage include Prisma configuration dependencies, AWS SDK XML dependencies, Resend/Svix/UUID, and PostCSS.

### Required action

- Upgrade Next.js and `eslint-config-next` to the latest compatible security-patched version outside every reported range.
- Update the remaining affected direct and transitive dependencies.
- Re-read the updated bundled Next.js documentation before adapting code.
- Rerun lint, typecheck, production build, authorization tests, image tests, and `npm audit`.
- Add dependency scanning as a continuous-integration release gate.

### 6.5 High: image processing is not durable and originals are used as fallbacks

### Evidence

- `src/app/admin/actions/galleries/assets-finalize/route.ts:83-87`
- `src/server/services/image-variants.ts:112-185`
- `src/server/services/public-gallery.ts:119-136`
- `src/server/services/site-content.ts:175-190`
- `src/lib/upload-limits.ts:3-6`

Variant generation is launched through request-bound `after()` work. Errors are logged and swallowed. There is no persisted processing state, retry queue, dead-letter state, or publication gate. A finalization request may contain up to 2,000 files, while each source may be as large as 100MB.

### Impact

- Processing can stop when the function lifetime ends.
- Failed assets remain present without visible recovery state.
- Newly published pages can fetch and transform large originals.
- Repeated cold optimizer work increases latency, bandwidth, and compute cost.
- Sharp may consume substantial memory while decoding an untrusted large or high-pixel-count object.

### Required action

- Add `UPLOADING`, `PROCESSING`, `READY`, `FAILED`, and `DELETING` asset states.
- Process variants through a durable idempotent queue with bounded concurrency, retry, and dead-letter visibility.
- Publish only `READY` assets.
- Never fall back from a missing derivative to an original.
- Surface failures to administrators with retry and removal controls.

### 6.6 High: direct upload finalization trusts client assertions

### Evidence

- `src/app/admin/actions/galleries/assets-upload-url/route.ts:15-68`
- `src/app/admin/actions/galleries/assets-finalize/route.ts:14-82`
- `src/app/admin/actions/galleries/archive-finalize/route.ts:9-40`
- `src/server/services/storage.ts:73-82`

The browser supplies the object key, MIME type, byte size, dimensions, and capture date at finalization. The route does not verify that the object exists, belongs to the issued upload session and gallery, matches the claimed byte count, has the expected checksum or signature, or is safe to decode.

### Impact

- Cross-gallery or unissued keys may be accepted.
- Mislabeled, malformed, polyglot, or oversized media may reach Sharp.
- Pixel bombs and decompression pressure can cause memory exhaustion.
- Archives are not malware scanned.
- Failed direct uploads can leave orphaned storage objects.

### Required action

- Create server-side upload-session records and quarantine prefixes.
- Issue opaque UUID/content-hash keys instead of timestamp-and-filename paths.
- At finalization, HEAD the object and verify upload ID, exact prefix, size, checksum, content type, and existence.
- Decode with explicit dimension, pixel-count, animation, and memory limits.
- Validate magic bytes rather than trusting extensions or client MIME values.
- Malware scan archives and apply ZIP-bomb limits.
- Promote objects to active storage only after processing succeeds.

### 6.7 High: share links are weak capability credentials

### Evidence

- `src/app/admin/actions/galleries/share-link/route.ts:13-20`
- `src/app/admin/actions/galleries/share-link/route.ts:70-106`
- `src/lib/slug.ts:13-15`
- `src/server/services/email-templates.ts:39-61`
- `prisma/schema.prisma:104-119`

Passwords, expiry, and recipient are optional. The generated suffix is eight hexadecimal characters, or approximately 32 bits. Custom slugs can be predictable. Capability slugs are stored in plaintext. The link and password may be sent in the same email, while quota and active-state controls are not fully exposed in the creation workflow.

### Required action

- Generate at least 128 bits of random capability material.
- Store only a secure hash of the capability token.
- Default private shares to an expiry.
- Support immediate revocation and grant-version rotation.
- Make quotas and active state configurable.
- Require password strength when passwords are used.
- Send the password through a separate channel or use recipient-bound OTP/magic-link verification.

### 6.8 High: deletion can report success while private objects remain

### Evidence

- `src/app/admin/actions/galleries/delete/route.ts:57-64`
- `src/app/admin/actions/galleries/assets-delete/route.ts:89-102`
- `src/app/admin/actions/site-content/update/route.ts:109-155`
- `src/app/admin/actions/galleries/archive-finalize/route.ts:35-51`

Storage failures are ignored through settled promises and the database records containing retry information are removed. Replaced site-content objects and prior archives can also be left behind.

### Impact

- The application may tell an administrator that deletion succeeded while personal media remains in storage.
- Lost object keys make reliable cleanup harder.
- Privacy-deletion and retention obligations cannot be demonstrated.

### Required action

- Use a deletion state machine or transactional outbox.
- Immediately block media access, but retain a tombstone until storage removal and cache purge are confirmed.
- Retry failed deletions and show unresolved items to administrators.
- Add orphan reconciliation and R2 lifecycle rules for quarantine and abandoned uploads.
- Document backup-retention and deletion behavior.

### 6.9 High: database, RSC, and DOM work grows without a practical bound

### Evidence

- `src/server/services/public-gallery.ts:10-11`
- `src/server/services/public-gallery.ts:183-207`
- `src/server/services/public-gallery.ts:221-322`
- `src/server/services/public-gallery.ts:406-417`
- `src/components/homepage-hero-mosaic.tsx:9-13`
- `src/components/public-gallery-mosaic.tsx:32-42`
- `src/app/g/[slug]/page.tsx:42-57`
- `src/app/admin/galleries/page.tsx:54-90`
- `src/components/admin-asset-manager.tsx:159-203`

Examples:

- The homepage queries up to 320 records and renders at most 40.
- Category pages can include every asset from up to 24 galleries before the client slices the result to 40.
- Public gallery detail queries every asset even though the public mosaic caps access at 40.
- Private galleries serialize and render the full photo collection.
- The admin galleries page loads all assets for up to 120 collapsed galleries.

### Impact

- Database time, server memory, HTML/RSC payload, hydration work, and DOM size grow with the full gallery.
- Public photos after item 40 are inaccessible despite being queried.
- A supported 2,000-image gallery is not practical on mobile or in the current admin view.

### Required action

- Apply limits in the database query, not after serialization.
- Initially send approximately 24-40 photos.
- Use cursor pagination and incremental lightbox metadata loading.
- Query only fields used by each DTO.
- Paginate admin gallery details when a section is opened.
- Keep initial payload and DOM size bounded regardless of total photo count.

### 6.10 High: too many images compete at eager and high priority

### Evidence

- `src/components/homepage-hero-mosaic.tsx:9-14`
- `src/components/homepage-hero-mosaic.tsx:105-114`
- `src/components/public-gallery-mosaic.tsx:32-44`
- `src/components/public-gallery-mosaic.tsx:77-86`
- `src/components/gallery-lightbox.tsx:131-134`
- `src/components/gallery-lightbox.tsx:218-223`
- `src/app/portfolio/page.tsx:48-56`

Current policies include:

- Homepage: 20 eager, 10 high priority.
- Public hero gallery: 20 eager, 10 high priority.
- Continuous public gallery: 15 eager, 5 high priority.
- Private album: up to 24 eager, 12 high priority.
- Portfolio covers: six eager, three high priority.

### Impact

Mobile bandwidth is divided across too many photos, delaying the real Largest Contentful Paint candidate, fonts, CSS, and JavaScript. The desktop constants are applied even when only a small two-column mobile viewport is visible.

### Required action

- Give high fetch priority to exactly one stable LCP candidate.
- Eager-load only images likely to be visible in the initial viewport.
- Lazy-load all remaining tiles.
- Ensure responsive `sizes` accurately match each layout.
- Measure request waterfalls under cold cache, Slow 4G, high latency, and low-end CPU throttling.

### 6.11 High: public rendering bypasses effective route caching

### Evidence

- `src/app/page.tsx:13-23`
- `src/app/portfolio/page.tsx:10-18`
- `src/app/portfolio/galleries/[slug]/page.tsx:15-35`
- `src/server/services/public-gallery.ts:325-403`
- `src/components/site-footer.tsx:41-43`

The homepage, portfolio, category pages, and public gallery routes are explicitly dynamic. Prisma reads are uncached and mutations do not invalidate tags. The portfolio overview schedules roughly 26 logical database calls. Metadata and page rendering can repeat the same gallery query.

### Impact

- Public pages pay database and rendering costs on every request.
- Time to first byte varies with database latency.
- Build and prerender operations may fail if Neon is temporarily unavailable.
- Public traffic scales database demand unnecessarily.

### Required action

- Consolidate portfolio summary queries.
- Use React `cache()` for per-render deduplication.
- Cache public data with explicit tags and invalidate those tags after admin mutations.
- Pilot the current Next.js cache model on one public route before broader migration.
- Isolate request-specific CSRF/form work behind a runtime/Suspense boundary so the gallery shell can remain cacheable.
- Add loading and error boundaries to database-backed public routes.

### 6.12 High: current variant selection loses detail and performs double optimization

### Evidence

- `src/server/services/image-variants.ts:6-10`
- `src/server/services/public-gallery.ts:125-140`
- `src/components/use-mobile-image-variant.ts:5-22`
- `src/components/gallery-lightbox.tsx:147-162`

Only 480px and 1600px variants exist. The canonical grid source is the 480px WebP. The lightbox chooses the 480px or 1600px variant through a JavaScript media query rather than allowing the browser to select by viewport and device-pixel ratio.

### Impact

- Retina phones and larger tiles can upscale a 480px source.
- Next.js may re-encode an already lossy WebP, adding transform cost without recovering detail.
- The hydration-time mobile switch can initially select the wrong source.
- A full-screen mobile lightbox may receive less than one source pixel per physical display pixel.

### Required action

Choose one image-transformation authority:

- Recommended: generate versioned 480, 960/1200, 1600, and optional 2400px derivatives and deliver them directly through CDN URLs/native `srcSet` or a custom Next loader.
- Alternative: retain the Next optimizer for public media only, using a sufficiently large canonical source and removing redundant display re-encoding.

Private media requires a separate authenticated delivery lane under either option.

### 6.13 High: image optimizer allowlisting is too broad

### Evidence

- `next.config.ts:3-45`

The configuration allows broad R2 wildcard hosts, lacks narrow pathname/search restrictions, includes a placeholder hostname, and allows quality 100 even though application code uses quality 75.

### Impact

Third-party remote images could consume optimizer CPU, bandwidth, and cache space. Broad allowlisting also weakens the media security boundary.

### Required action

- Permit only exact owned preview origins and path prefixes.
- Remove unused placeholder and wildcard patterns.
- Remove unused quality settings.
- Disable unnecessary redirects.
- Limit maximum upstream image response size.
- Revisit the optimizer configuration after selecting the final public/private media architecture.

### 6.14 Medium: object caching policy is undefined

### Evidence

- `src/server/services/storage.ts:73-108`
- `next.config.ts:20-23`

R2 uploads set content type but no explicit `Cache-Control`, immutable version, checksum metadata, or delivery classification. Regenerated variants can reuse paths while the Next optimizer retains old results.

### Required action

- Use content-addressed or versioned derivative keys.
- Apply long `public, immutable` caching only to public derivatives.
- Keep private originals and derivatives behind controlled authorization and cache policies.
- Store verified checksums and media processing version metadata.

### 6.15 Medium: interaction-only JavaScript is loaded before interaction

### Evidence

- `src/components/homepage-hero-mosaic.tsx:1-5`
- `src/components/gallery-lightbox.tsx:5-18`
- `src/components/public-gallery-mosaic.tsx:5-9`
- `src/components/turnstile-field.tsx:29-86`
- `src/app/layout.tsx:2-12`
- `src/components/photo-resource-hints.tsx:9-12`

The static homepage mosaic is a Client Component. Gallery entry bundles eagerly include lightbox, zoom, thumbnail, download, and photo-album code even while the lightbox is closed. Turnstile loads after hydration even when its form is below the fold. Geist Mono is globally loaded but is not used by the current site styles. Every route preconnects to R2 even though initial optimized images are requested from the application origin.

Approximate generated gallery-specific JavaScript observed in production artifacts:

- Public gallery: approximately 22.7KiB Brotli before opening the lightbox.
- Private gallery: approximately 27.5KiB Brotli before opening the lightbox.

### Required action

- Render static mosaics on the server.
- Keep only a small tile interaction island on the client.
- Dynamically import the lightbox and plugins on hover, focus, or first activation.
- Load Turnstile when the form approaches the viewport or receives interaction.
- Remove the unused font.
- Scope preconnects to routes and resources that use direct R2/CDN delivery during initial load.

### 6.16 Medium: mobile “download all” launches individual downloads

### Evidence

- `src/components/gallery-lightbox.tsx:61-83`
- `src/components/gallery-lightbox.tsx:165-180`

The current behavior starts one timed browser download per asset.

### Impact

- Mobile Safari or Chrome may block or drop downloads.
- Many signed requests consume radio time, battery, bandwidth, and server resources.
- A single user action can unexpectedly exhaust the gallery download limit.

### Required action

Use one prepared ZIP archive for “download all,” with clear archive state, size, expiration, and retry behavior. Keep individual downloads explicit.

### 6.17 Medium: upload behavior is fragile on mobile and large batches

### Evidence

- `src/components/admin-asset-upload.tsx:177-267`
- `src/components/admin-archive-upload.tsx:24-149`

Photo uploads are sequential. A later failure can prevent the successful earlier objects from being finalized. A ZIP up to 1GiB is sent in one request without multipart resume, progress granularity, or cancellation. The fallback path may restart an entire object through the application server.

### Required action

- Use idempotent upload sessions and per-file finalization.
- Use bounded concurrency, for example three or four active photo uploads.
- Persist progress and completed-part state.
- Add cancellation and targeted retry.
- Use multipart upload for large archives.
- Reconcile abandoned uploads automatically.
- Derive dimensions on the trusted processing worker rather than relying on browser decoding.

### 6.18 Medium: mobile navigation and controls are functionally too small

### Evidence

- `src/app/globals.css:122-135`
- `src/app/globals.css:164-175`
- `src/app/globals.css:196-211`
- `src/app/globals.css:279-328`

Navigation is clipped with `overflow: hidden`, while link text shrinks to approximately 8.6px, 7.4px, and 6.7px at narrower breakpoints. Many navigation, call-to-action, and admin controls lack an appropriate minimum touch area.

### Required action

- Replace shrink-to-fit navigation with a deliberate mobile menu or accessible scrollable navigation.
- Keep text readable without browser zoom.
- Provide at least 44-by-44 CSS-pixel actionable targets where practical.
- Preserve visible focus and keyboard access.
- Validate 320, 375, 390, 430, 768, and 1024 CSS-pixel widths.

### 6.19 Medium: mobile lightbox and form behavior needs hardening

### Evidence

- `src/components/gallery-lightbox.tsx:147-164`
- `src/components/gallery-lightbox.tsx:233-242`
- `src/components/contact-form.tsx:131-155`
- `src/components/booking-form.tsx:130-163`
- `src/app/g/[slug]/page.tsx:87-95`
- `src/components/turnstile-field.tsx:36-86`

The lightbox always enables thumbnails, which consumes mobile viewport and can trigger extra network work. Forms rely on placeholders instead of durable visible labels, phone fields lack `type="tel"`, autocomplete is incomplete, and asynchronous messages do not consistently use live announcements or field-linked errors. Turnstile lacks a robust responsive/retry state after a flaky script load.

### Required action

- Use native responsive lightbox sources.
- Hide or defer thumbnails on narrow or data-saving devices.
- Test swipe, pinch, rotation, close, focus return, and reduced motion.
- Add visible labels, correct input types, autocomplete, `aria-describedby`, and `aria-live` status regions.
- Focus the first invalid field after submission.
- Add explicit Turnstile loading, failure, and retry states.

### 6.20 Medium: admin reordering and deletion are not mobile safe

### Evidence

- `src/components/admin-asset-manager.tsx:140-200`

Ordering relies on desktop HTML drag and drop. There is no touch or keyboard alternative. Delete executes immediately from small controls.

### Required action

- Add keyboard and touch ordering controls.
- Consider explicit move-before/move-after or position controls for accessibility.
- Require confirmation, provide undo, or use soft deletion.
- Keep destructive controls separated from common navigation actions.

### 6.21 Medium: HEIC behavior is inconsistent with mobile camera uploads

The file picker accepts broad image input, while server validation supports JPEG, PNG, WebP, GIF, and AVIF but not HEIC/HEIF. iPhone uploads may therefore be selected and fail later.

### Required action

Choose and communicate one policy:

- safely convert HEIC/HEIF in the quarantined worker; or
- reject it before upload with matching picker restrictions and clear instructions.

Test the selected policy using real iPhone photos.

### 6.22 High: admin sessions are long-lived and non-revocable

### Evidence

- `src/server/auth/admin-session.ts:5-50`
- `src/config/env.ts:11-15`
- `src/app/api/admin/login/route.ts:37-46`
- `src/server/auth/cookies.ts:3-10`

Admin JWTs last 14 days and are accepted by signature and claims alone. Removing an administrator or OAuth allowlist entry does not invalidate an existing session. There is no session identifier, server-side device/session table, forced logout, or mandatory MFA. Plaintext password fallback remains supported.

### Required action

- Prefer OAuth-only administration with provider-enforced MFA, or use a managed authentication system.
- Use short-lived database-backed sessions that can be enumerated and revoked.
- Recheck account state for sensitive operations.
- Remove plaintext-password production support.
- Require strong, separate signing secrets.
- Prefer `__Host-` cookie names where deployment constraints allow.

### 6.23 High: the public first-admin setup can be claimed or raced

### Evidence

- `proxy.ts:59-63`
- `src/app/api/admin/setup/route.ts:42-98`
- `prisma/schema.prisma:48-54`

On a fresh database, the first successful public setup request can create an administrator. The check and create operations do not enforce a database singleton transaction, so concurrent requests can race.

### Required action

- Bootstrap the first administrator through deployment tooling or a one-time high-entropy setup token.
- Enforce the singleton condition in the database/transaction.
- Permanently disable the setup route after provisioning.

### 6.24 Medium: rate limiting trusts forwarding headers and can fail open

### Evidence

- `src/server/security/rate-limit.ts:21-43`
- `src/server/security/rate-limit.ts:77-144`
- `src/server/security/turnstile.ts:9-46`

The implementation trusts the first `x-forwarded-for` value. The fallback limiter is process-local and unbounded for unique keys, while database errors fall back to it. The limiter table is created at runtime and has no evident cleanup policy. Turnstile verification checks success but not the expected hostname and action.

### Required action

- Use the deployment platform's documented trusted client-IP source.
- Hash IP-derived identifiers with a rotating privacy key.
- Use a distributed limiter with TTL cleanup.
- Define fail-closed rules for login, setup, and gallery unlock.
- Add per-share/session download burst and concurrency limits.
- Validate the expected Turnstile hostname and action.

### 6.25 Medium: production Content Security Policy is permissive

### Evidence

- `proxy.ts:8-24`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/contentSecurityPolicy.md`

Production currently allows both `'unsafe-inline'` and `'unsafe-eval'`, all HTTPS image origins, and all HTTPS connection origins. The bundled Next documentation indicates that `'unsafe-eval'` is a development requirement, not a general production requirement. It also explains that a nonce-based CSP can force dynamic rendering and reduce public caching.

### Required action

- Upgrade Next.js before changing CSP behavior.
- Roll out tighter rules in report-only mode first.
- Remove production `'unsafe-eval'`.
- Restrict `img-src` and `connect-src` to exact owned and required origins.
- Add `object-src 'none'`.
- Use route-appropriate policies: strong nonce protection on already-dynamic private/admin areas, while retaining a cache-friendly policy for public pages.
- Ensure headers cover error responses and image/media routes rather than relying on Proxy as the only security layer.

### 6.26 Medium: retention and access auditing are not defined

### Evidence

- `prisma/schema.prisma:122-176`
- Public contact and booking routes.
- Email-provider delivery paths.

The system stores contact details, WhatsApp/phone values, messages, recipient emails, and email bodies without an explicit retention model. Public submissions are duplicated into provider email systems. Gallery downloads have an aggregate counter but not a minimal security audit trail.

### Required action

- Define retention periods for photos, shares, inquiries, emails, rate-limit identifiers, logs, and backups.
- Document deletion and data-export procedures.
- Add tamper-resistant minimal audit events for login, share creation/revocation, download issuance, publication, and deletion.
- Never log signed URLs, session or CSRF tokens, passwords, raw object keys, or full sensitive request bodies.
- Test backup restoration and document how deletion propagates into backups.

### 6.27 Medium: user-controlled names are inserted into HTML email

### Evidence

- `src/lib/validators/forms.ts:5-26`
- `src/server/services/email-templates.ts:20-29`
- `src/server/services/email-templates.ts:39-60`

Public name fields can contain markup and are interpolated into HTML email greetings without explicit HTML escaping. Email clients generally sanitize scripts, but markup, tracking, and phishing-style injection remain possible.

### Required action

- HTML-escape every dynamic value inserted into email HTML.
- Reject CR, LF, and control characters from values used in mail subjects or headers.
- Add tests with markup and Unicode edge cases.

## 7. Recommended target media architecture

| Concern | Public portfolio | Private client galleries |
|---|---|---|
| Original storage | Private source/quarantine bucket | Private source/quarantine bucket |
| Public objects | Explicitly published derivatives only | None |
| Preview delivery | Immutable CDN URLs | Authenticated Cloudflare Worker/private CDN route |
| Authorization | Publication state | Gallery, share, expiry, grant, and session checked at media request |
| Cache policy | Long-lived and immutable with versioned keys | Short grant lifetime; edge may cache the underlying derivative only after per-request authorization |
| Responsive output | Native `srcSet` or custom loader | Native `srcSet` of authenticated derivative URLs |
| Next optimizer | Optional for public media only | Never used for protected media |
| Original download | Normally unavailable | Short-lived signed route after authorization |
| Revocation | Unpublish/version change | Immediate page denial; issued media grant expires within the agreed short window |

### Recommended image-transformation path

Generate responsive derivatives once through a durable worker and serve them from Cloudflare/CDN infrastructure. Continue using `next/image` for dimensions, responsive markup, and layout where helpful, but use a custom loader or direct responsive source set so the same image is not encoded once by Sharp and again by Next.js.

Suggested derivative set, to be finalized from real layout measurements:

- 480px for compact tiles.
- 960px or 1200px for high-DPR mobile and medium layouts.
- 1600px for desktop/lightbox use.
- Optional 2400px for full-screen high-density displays where quality justifies the bandwidth.
- A tiny dominant-color or blur placeholder.

Each derivative should have a content/version-based key and verified width, height, format, size, checksum, and processing-version metadata.

### Alternatives considered

| Option | Benefits | Costs/risks | Recommendation |
|---|---|---|---|
| Pre-generated CDN variants plus authenticated private edge delivery | Predictable quality, no visitor-time transforms, strong private boundary, stable cost and caching | Requires a durable queue, Worker authorization, and migration | Recommended |
| Next optimizer for public photos plus authenticated private edge delivery | Less public pipeline complexity | Cold transforms and Vercel image cost remain; private pipeline is still separate | Acceptable interim option |
| Proxy all private image bytes through the Next/Vercel application | Straightforward centralized authorization | Higher latency, bandwidth, function, and scaling cost | Not recommended for large galleries |

## 8. Phased implementation plan

Implementation must not begin until the target architecture and security decisions are approved.

### Phase 0: establish safety and measurements

- Do not onboard valuable private galleries until public preview access is removed.
- Patch Next.js and affected dependencies.
- Record production baselines for the homepage, a category, a public gallery, and a private gallery.
- Add Web Vitals, route timing, database timing, image failures, cache-hit rate, and processing telemetry.
- Add production build, dependency audit, and mobile Lighthouse checks to CI.
- Define a test media set that includes large JPEGs, PNGs, AVIF, malformed images, high-megapixel files, and the selected HEIC behavior.

### Phase 0 exit gate

- Updated dependencies pass lint, typecheck, build, functional tests, and audit policy.
- Baseline measurements are stored and reproducible.
- No valuable private client content has been placed on a public media origin.

### Phase 1: create the private storage and authorization boundary

- Split public derivatives from all private media.
- Move private originals, previews, and archives to a non-public origin.
- Implement the authenticated private media edge route.
- Centralize all gallery authorization in one server-only layer.
- Enforce gallery and share-link active state everywhere.
- Introduce hashed 128-bit share capabilities and grant-version rotation.
- Add private-route `no-store`, `noindex`, `nofollow`, and `noarchive` behavior.
- Add revocable admin sessions, OAuth/MFA policy, secret separation, and permanent setup closure.
- Add deletion tombstones/outbox and storage retry.

### Phase 1 exit gate

- Known private object keys return `403` or `404` from every unauthenticated storage/public hostname.
- Private page HTML/RSC contains no public R2 URL, raw object key, or private `/_next/image` parameter.
- Gallery deactivation, share revocation, expiry, and password/grant rotation deny page, preview, and download access.
- Already issued preview grants expire within the approved short interval, ideally 60-120 seconds.

### Phase 2: rebuild ingestion and responsive delivery

- Add upload sessions and asset processing states.
- Quarantine and verify every uploaded object server-side.
- Add the durable image-processing queue.
- Generate versioned responsive variants and compact placeholders.
- Strip preview EXIF and enforce decoder/pixel/animation limits.
- Malware scan and validate archives.
- Add retry, failure visibility, deletion retry, and orphan reconciliation.
- Backfill existing assets through the same pipeline.
- Prohibit publication and original fallback until every visible asset is `READY`.

### Phase 2 exit gate

- All published assets are `READY`.
- No preview request uses an original object.
- Mislabeled, malformed, oversized, cross-gallery, nonexistent, checksum-mismatched, or pixel-bomb uploads cannot reach processing or `READY` state.
- Failed processing jobs retry, remain visible, and do not publish unsafe fallbacks.

### Phase 3: reduce server, payload, and browser work

- Limit photo queries before serialization.
- Add cursor pagination to public, private, and admin galleries.
- Remove the public 40-photo accessibility cap.
- Consolidate portfolio summary queries.
- Deduplicate metadata/page queries.
- Add public cache tags and mutation invalidation.
- Move the static homepage mosaic to the server.
- Give high priority to exactly one LCP image.
- Lazy-load lightbox/plugin and Turnstile code.
- Remove unused fonts and route-global resource hints.
- Use one ZIP for bulk downloads.

### Phase 3 exit gate

- A 1,000-photo gallery initially serializes and renders no more than 30-40 photo DTOs.
- Initial payload and DOM size remain bounded as gallery size grows.
- Exactly one image per page has high fetch priority.
- No lightbox/plugin JavaScript is requested before lightbox interaction or deliberate preloading.
- Public cache invalidation occurs after gallery/content changes.

### Phase 4: mobile functionality and upload resilience

- Replace clipped, shrinking navigation with a deliberate mobile pattern.
- Enforce readable controls and appropriate touch targets.
- Add visible labels, autocomplete, telephone input behavior, live status, and error focus.
- Adapt the lightbox for mobile gestures, safe areas, rotation, focus return, and reduced motion.
- Hide/defer mobile thumbnails.
- Add touch/keyboard admin ordering and safe deletion.
- Implement resumable photo and multipart archive uploads with bounded concurrency, cancellation, retry, and persisted progress.
- Implement and test the explicit HEIC policy.

### Phase 4 exit gate

- No horizontal page overflow at 320px.
- Navigation and form controls remain readable without focus zoom.
- Actionable controls meet the agreed touch-size standard.
- A 50-file upload survives two injected network failures and a page reload without restarting completed files or leaving permanent orphans.
- A large archive resumes from its last confirmed part rather than byte zero.

### Phase 5: operational security and ongoing performance

- Add minimal security audit events.
- Add distributed rate limiting and trusted client-IP handling.
- Bind Turnstile checks to expected hostname/action.
- Tighten image origins, CORS, CSP, and private headers.
- Define retention, deletion, backup, restoration, and incident-response procedures.
- Add performance budgets and real-user alerting.
- Add storage-policy, authorization-negative, malicious-upload, deletion, and backup-restore tests.
- Arrange an external penetration test before private-gallery launch.

### Phase 5 exit gate

- Production CSP has no unnecessary `'unsafe-eval'` or broad HTTPS wildcards.
- Runtime dependency scanning has no unaccepted high or critical advisories.
- Rate limiting works across instances and cannot be bypassed with forged forwarding headers.
- A documented retention/deletion policy covers R2, database PII, provider email copies, logs, and backups.
- External security findings are resolved or formally accepted before launch.

## 9. Acceptance criteria and performance budgets

| Area | Target |
|---|---|
| Mobile Core Web Vitals | p75 LCP no more than 2.5s, INP no more than 200ms, CLS no more than 0.1 |
| Public warm TTFB | p75 target no more than 500ms from a representative region |
| Initial image priority | Exactly one high-priority candidate; no more than approximately four eager images on mobile or six on desktop unless measurement justifies more |
| Initial mobile images | Target no more than 500KB on a representative 390px Slow-4G run |
| Responsive source quality | Selected source width approximately 1-1.5 times the required physical width; no 480px upscaling for large/high-DPR presentation |
| Initial gallery payload | No more than 30-40 photo DTOs and an agreed 100-150KB HTML/RSC budget |
| Database | Portfolio overview target no more than four logical database round trips; duplicate metadata/page reads eliminated |
| JavaScript | Public gallery initial route target no more than approximately 35KB gzip of gallery-specific JavaScript; lightbox chunk absent before interaction |
| Public media cache | Versioned immutable derivatives with at least 95% warm cache-hit target |
| Private media | Unauthenticated object requests return `403/404`; no public storage or optimizer URL leaks |
| Private revocation | Page access is immediate; already issued preview grants expire within the approved short window |
| Ingestion | 100% of published assets are `READY`; failed jobs are observable and retryable |
| Upload verification | Server-derived type, size, dimensions, checksum, key ownership, and megapixel limit |
| Gallery scale | A 1,000-photo gallery starts with no more than 30-40 DOM tiles and bounded data |
| Mobile viewport testing | 320, 375, 390, 430, 768, and 1024 CSS pixels |
| Browser/device testing | iOS Safari, Android Chrome, desktop evergreen browsers, and a low-end Android CPU profile |
| Network testing | Slow 4G, Fast 3G, 500ms latency, offline/reconnect, background/resume, and Save-Data where available |
| Accessibility | Keyboard/touch gallery operation, visible labels and focus, reduced motion, live errors, and suitable target sizes |
| Deletion | Access blocked immediately; object/CDN deletion confirmed within a documented service objective; failures remain queued |
| Release gate | Lint, typecheck, production build, functional tests, authorization tests, mobile performance budget, and dependency policy pass |

## 10. Security test cases required before launch

- Request known private original, derivative, and archive keys without a session.
- Request private media through every configured R2/custom/public hostname.
- Inspect HTML, RSC, optimizer parameters, logs, and analytics for object-key leakage.
- Revoke, expire, deactivate, and rotate a share during an active session.
- Change a gallery password and verify older gallery grants stop working.
- Remove an admin and verify existing sessions can be revoked.
- Attempt cross-gallery object finalization.
- Finalize nonexistent, truncated, oversized, checksum-mismatched, polyglot, malformed, animated, and pixel-bomb images.
- Upload malicious or highly compressed archives.
- Interrupt object and database deletion independently and verify retry/tombstone behavior.
- Forge forwarding headers against every rate-limited route.
- Test Turnstile with wrong hostname/action responses.
- Test CSP on public, private, admin, error, and media responses.
- Confirm logs never contain tokens, passwords, signed URLs, raw object keys, or full sensitive request bodies.
- Restore a backup and verify the documented deletion and key-rotation procedures.

## 11. Mobile test matrix

### Viewports

- 320px compact phone.
- 375px common iPhone width.
- 390px modern iPhone width.
- 430px large phone.
- 768px tablet/portrait breakpoint.
- 1024px tablet/desktop boundary.

### Conditions

- Cold cache and warm cache.
- Slow 4G and Fast 3G.
- Approximately 500ms latency.
- Low-end Android CPU throttling.
- Offline during upload, followed by reconnect.
- Background/resume during upload and download.
- Data-saving mode where available.
- Portrait/landscape rotation.
- Reduced-motion preference.

### Workflows

- Homepage first load and scroll.
- Category with many galleries.
- Public gallery pagination and deep-lightbox navigation.
- Private password unlock and revocation.
- Individual and ZIP download.
- Fifty-photo upload with injected failures.
- Large archive multipart resume.
- Touch and keyboard reordering.
- Deletion confirmation/undo.
- Contact and booking form validation.
- Turnstile failure and retry.
- Real iPhone HEIC selection.

## 12. Decisions required before implementation

### Decision 1: storage and private delivery

**Recommended:** Separate public portfolio derivatives from a completely private media origin, and authorize private derivative requests through a Cloudflare Worker or equivalent edge gateway.

This is the highest-priority decision because every later image, cache, and revocation choice depends on it.

### Decision 2: image optimization authority

**Recommended:** Use durable pre-generated responsive derivatives as the single transformation path. Keep Next.js image markup/layout features but avoid re-encoding those derivatives through the public optimizer.

### Decision 3: administration authentication

**Recommended:** Use OAuth-only administration with provider-enforced MFA and short-lived, database-backed revocable application sessions. Remove the production plaintext-password fallback and permanently close setup after provisioning.

### Decision 4: durable processing infrastructure

Select a queue/worker provider only after the storage architecture is approved. The selected option must support idempotency, bounded concurrency, retry, dead-letter visibility, observability, and safe secret access.

### Decision 5: HEIC policy

Choose either trusted server-side conversion in quarantine or explicit early rejection. The picker, validation, copy, and tests must all agree.

## 13. Suggested implementation sequence

1. Dependency/security update with no architecture change.
2. Private bucket/origin and authenticated media proof of concept.
3. Centralized gallery authorization and revocation tests.
4. Upload-session and asset-state schema migration.
5. Durable worker and responsive derivative pipeline.
6. Backfill and storage migration.
7. Query pagination, public caching, and mutation invalidation.
8. Image priorities, Server Component boundaries, and lazy lightbox loading.
9. Mobile navigation, forms, lightbox, and admin controls.
10. Upload resume, archive workflow, deletion reconciliation, and operations.
11. Full performance/security regression suite and external penetration test.

Each item should be delivered and verified as a separate, reviewable change. The storage boundary and authorization tests should be completed before any private-photo migration.

## 14. Key dependencies and risks

- Cloudflare Worker/private CDN authorization design.
- Public and private R2 bucket/domain configuration.
- Queue/worker selection and operational cost.
- Migration and backfill of existing objects without URL leakage.
- Vercel image-transformation and bandwidth costs if the optimizer remains in the public path.
- R2 CORS, cache, lifecycle, and deletion configuration.
- Database schema migrations for asset state, upload sessions, revocable sessions, capabilities, audit events, and deletion outbox.
- Retention and backup requirements for personal photographs and contact information.
- Client expectations around download expiry and link revocation.

## 15. Final recommendation

Approve the hybrid media architecture first:

- public, versioned portfolio derivatives on a public CDN;
- all client originals and derivatives in private storage;
- authenticated edge delivery for private previews;
- short-lived signed original/ZIP downloads;
- durable pre-generated responsive variants;
- no original preview fallback;
- no protected media through the public Next.js optimizer.

After approval, begin with the dependency patch and Phase 1 private-media boundary only. Stop for a security verification checkpoint before migrating images or implementing broader performance changes.

---

**Audit note:** This document records a read-only review. It does not represent completed remediation, and it should not be treated as authorization to begin implementation before the architectural decisions above are approved.
