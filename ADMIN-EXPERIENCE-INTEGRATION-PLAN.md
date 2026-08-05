# Admin Experience & Client Gallery Integration Plan

**Project:** Alex Bereanu Photography  
**Prepared:** 2026-08-04  
**Status:** Phases 1–6 implemented locally; schema-backed Phases 2–4 and final Phase 6 retirement remain disabled, with migrations and external release gates intentionally unapplied  
**Primary objective:** Turn the existing Admin into a secure, efficient control center for public galleries, website content, and private client delivery while preserving the current public-site visual identity and image-performance work.

## User prompt

> good, now let's focus on improving the Admin too. Create a plan first and let me review it first. Main goal is to take what was improved until now on website and integrate with a better Admin. Key points are: 
> - I want to be able to upload new galleries to the existing categories on the site, manage those galleries, add/remove photos
> - Custom names and texts for all site pages (I need to be able to update titles, texts and other assets that appear on each page of the website)
> - Create private links for each gallery, in order to be viewed by the clients and downloaded directly in the phone (keep the UI same as current website UI) but add download buttons for each photo and a general download for all photos in the gallery) full quality downloads.

### Phase 0 decisions and download-direction update

> continue phase 0 with the recommended option for all 5, with one mention for no 1: let's also implement the option to later generate a new zip once the gallery is modified, and discard the previous zip file once the new is generated.

> actually let's rethink the use of zip files for downloads and simply download each individual photo to the client's device. This was it can be saved directly in a phones gallery (zip files cannot be stored directly in a phone photos gallery) and this would limit the functionality of the custom gallery private link

The second prompt supersedes the ZIP-generation direction in the first. Phase 0 therefore records individual full-quality photo saving as the approved delivery model.

## Executive recommendation

Keep the existing secure media pipeline and gallery data model, but reorganize the Admin around three clear workflows:

1. **Galleries:** create, edit, upload, order, publish, remove, and recover photos.
2. **Pages:** edit structured content and assets for every public page, preview changes, then publish them.
3. **Client delivery:** create/revoke private links and make every photo individually available in full quality through a phone-oriented save/download flow.

The recommended Admin is an operational interface, not a visual clone of the public site. It should be faster and denser where useful, while public previews and private client galleries continue to use the site's current editorial styling, responsive photo grid, and lightbox.

The approved direction no longer depends on ZIP archives. The current implementation already authorizes downloads of individual private originals. The improved system will make that the primary client workflow, add a clear action to every grid item and lightbox view, and provide a phone-specific save experience. Existing manual ZIP support will be retired only after private galleries have a verified individual-photo path.

## Audit scope and method

This plan is based on a code audit of the current Next.js application, Prisma models, Admin routes and components, private gallery page, upload/processing services, access controls, and download endpoints.

The authenticated Admin could not be visually inspected without an authenticated session; therefore, the Admin UI assessment is based on its rendered component structure and routes. The public and private-gallery component reuse is visible in the implementation.

Guidance applied:

- Next.js App Router server/client boundary and route-handler practices.
- React/Next.js performance practices: server-first reads, narrow client islands, parallel data loading, minimal serialized data, and deferred heavy UI.
- Mobile-first Admin UX, accessible forms, 44px minimum targets, keyboard alternatives, explicit progress/error feedback, and reduced-motion support.
- The current [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), especially around labels, focus, destructive actions, URL state, long lists, unsaved changes, and accessible status messages.

## What already exists

The project already contains much of the secure foundation needed for this work.

| Requirement | Existing capability | Main gap |
|---|---|---|
| Create galleries in site categories | Gallery creation supports the existing Prisma categories, title, slug, description, visibility, and active state | Creation and management are split across a large overview and expandable gallery page; no explicit draft/publish lifecycle |
| Add photos | Multi-file uploads, file hashing, resumable checkpoints, direct storage uploads, server relay for smaller files, bounded concurrency, verification, derivatives, and processing jobs | Upload state is summarized rather than shown per file; limited batch actions; the gallery list loads too much management UI |
| Remove and order photos | Delete, queued storage cleanup, pointer drag, keyboard/touch move controls, cursor pagination | Permanent deletion is easy to reach; no recycle bin; no visual thumbnail workspace; ordering across paginated assets needs a clearer model |
| Edit gallery details | Title, slug, category, visibility, description, and active toggle | Controls are embedded in expanded list cards; no dedicated preview or publication checklist |
| Edit website content | Structured records for homepage About/Connect, Instagram, portfolio index, and portfolio categories; selected page images and alt text | Not all global/page assets are covered; changes publish immediately; no revision history, preview, rollback, SEO fields, or unsaved-change protection |
| Create private client links | Hashed capability tokens, optional 12+ character password, recipient email, expiry, max downloads, revoke action, email delivery, and access audit events | Link management needs clearer status/activity; the current request counter needs individual-photo semantics |
| Private client viewing | No-index private route using the existing editorial gallery/lightbox UI and authenticated preview variants | Download actions can be integrated more clearly into the grid/lightbox and optimized for mobile use |
| Per-photo full-quality download | Authorized endpoint returns the private source original as an attachment | Needs clearer mobile interaction, download activity visibility, and an explicit quota policy |
| Save photos to a phone | Authorized individual-original endpoint exists | A normal browser download may land in Files/Downloads rather than Photos; the UI needs a supported Save/Share path and honest per-platform fallback |
| Original protection | Originals are in private storage; private previews go through authenticated routes; public pages use derivatives | These guarantees need regression tests and must remain invariant through Admin changes |

## Current implementation findings

### Strengths to preserve

- Public galleries already use derivative variants rather than full originals for the grid.
- Private-gallery originals are not used as preview fallbacks.
- Source uploads are verified and processed through jobs; storage deletion has a retry queue.
- Large photo uploads can resume and use bounded parallelism.
- Share-link tokens are hashed at rest and shown only when first created.
- Share links support password protection, expiry, revocation, email delivery, and a maximum-download setting.
- Private gallery pages declare no-index/no-follow metadata.
- Existing mutation routes use an Admin session check, CSRF/origin protection, and schema validation.
- Reordering has pointer, keyboard, and touch-compatible controls.

### Friction and risk to address

- The Admin home mixes system operations, gallery creation, and all page-content forms in one long route.
- Gallery management uses expandable cards on a category list. An expanded gallery mounts detail forms, uploads, assets, archive controls, share links, and a table together.
- The gallery query loads as many as 40 assets per gallery. With many galleries, this multiplies data transfer and client hydration even when the user only needs a list.
- `isActive` is an ambiguous publication control. A gallery can be active/inactive and public/private, but the lifecycle is not clear enough for safe operations.
- Photo removal currently initiates permanent logical deletion and queued physical cleanup. Valuable photos need a recoverable deletion window or an explicit policy decision.
- Website content saves directly to the live record and invalidates the cache immediately.
- The current content registry covers a useful subset, but not every global label, metadata field, page-specific asset, navigation/footer item, or future page.
- The existing manual ZIP workflow does not match the approved phone-first delivery model and should be phased out safely.
- `maxDownloads` currently counts requests rather than unique successfully delivered photos. Retries or repeat taps can exhaust a client link unexpectedly.
- Admin mutation audit coverage is stronger for authentication and share links than for gallery, asset, content, and photo-download lifecycle actions.

## Proposed Admin information architecture

### Primary navigation

| Section | Purpose |
|---|---|
| **Dashboard** | Recent activity, failed processing, download failures, low-level operational alerts, and shortcuts |
| **Galleries** | Search/filter all galleries, create a gallery, and open a dedicated gallery workspace |
| **Pages** | Edit structured website content, images, navigation/footer settings, metadata, and preview revisions |
| **Tickets** | Preserve the current request/ticket workflow |
| **Operations** | Media jobs, storage cleanup, security/activity audit, and health; kept out of the normal editing flow |

On desktop, use a compact persistent sidebar. On mobile, use a compact header plus a small primary navigation or “More” sheet; avoid squeezing every destination into a horizontal row.

### Proposed routes

```text
/admin
/admin/galleries
/admin/galleries/new
/admin/galleries/[galleryId]
  ?tab=details
  ?tab=photos
  ?tab=client-access
  ?tab=downloads
  ?tab=activity
/admin/pages
/admin/pages/[contentKey]
/admin/tickets
/admin/operations
```

Tabs and filters should be reflected in the URL so the browser Back button, refresh, and copied Admin links return to the same state.

## Gallery management design

### Gallery list

The gallery list should fetch summaries only:

- Thumbnail, name, category, lifecycle status, visibility, photo count, active link count, recent download activity, and updated date.
- Search by name/slug and filters for category, status, visibility, and processing/download failures.
- Cursor pagination; no photo arrays or upload components in list results.
- Desktop table/card hybrid; compact cards on mobile.
- A single primary “New gallery” action.

### Create-gallery flow

Recommended fields:

- Title and generated slug, with an editable slug and conflict validation.
- Existing site category.
- Public or private visibility.
- Description/client message.
- Lifecycle starts as **Draft** by default.
- Optional cover/featured photo after upload.

A private gallery may still belong to a visual category, but it must never appear on a public category page unless its visibility is changed to Public and it is Published. Client delivery should be a separate explicit capability: a Published public or private gallery may enable private original-download links without changing whether its previews are publicly discoverable.

### Dedicated gallery workspace

#### Details

- Name, slug, category, description, visibility, cover photo, and lifecycle status.
- Public/client preview in a new tab.
- Publication checklist: at least one ready photo, no blocking media failures, valid metadata, and verified individual-original delivery if client access is enabled.
- A clear distinction between **Save draft**, **Publish**, **Unpublish**, and **Archive**.

#### Photos

- Responsive thumbnail grid using small/medium derivatives only; never download originals to render the Admin grid.
- Drop zone plus file picker that works with mobile camera/photo-library sources.
- Per-file upload rows: filename, size, hashing, uploading, verifying, processing, ready/failed, progress, retry, pause, and cancel.
- Preserve resumable/multipart behavior and bounded concurrency. Reduce concurrency on constrained mobile connections where supported.
- Batch select, remove, retry, move to another gallery, and edit metadata.
- Pointer drag on desktop plus Move Earlier/Later and position controls for keyboard/touch users.
- Caption, alt text, focal point, and optional capture date per image.
- Unsaved ordering indicator and sticky Save Order action.
- For large galleries, cursor pagination or windowing/content visibility; avoid mounting hundreds of full cards.

#### Safe removal

Recommended default: move a photo to a **Recycle Bin** for 30 days, immediately remove it from public/client views and authorized download results, and purge the private original/variants through the existing deletion worker after retention expires.

The Admin should allow Restore and Purge Now. “Purge Now” requires explicit confirmation and, ideally, step-up authentication. The retention period must be configurable to satisfy the owner's privacy policy.

#### Activity

- Who performed the action, timestamp, action type, target, and outcome.
- Upload, processing, reorder, metadata edit, publish/unpublish, removal/restore/purge, link creation/revocation, and full-quality photo download events.
- Do not record capability tokens, passwords, signed URLs, or unnecessary client personal data.

## Website page/content management

### Recommended content model

Use a **typed structured content registry**, not an unrestricted page builder in the first iteration. This preserves the current design, is safer than accepting arbitrary HTML, and makes every field easy to validate and preview.

Each public page should declare its editable regions and asset requirements in code. The Admin then renders the correct editor for that page.

Standard editable fields:

- Page title, eyebrow/subtitle, introductory text, section titles, paragraphs, CTA title/label/body/link.
- Hero image, section images, alt text, focal point, and optional mobile crop.
- SEO title, meta description, social/share image, and canonical settings where applicable.
- Page-specific labels and empty-state copy.

Global settings:

- Brand/site name and logo assets.
- Main navigation labels and destinations.
- Footer text and links.
- Contact details and social links.
- Default SEO/share assets.

### Page inventory checkpoint

Before building editors, map every visible string and replaceable asset across:

- Homepage.
- Portfolio index.
- Each existing portfolio category.
- Individual public gallery page.
- Wedding landing route.
- Private gallery access/unlock screen and client-gallery instructions.
- Shared header, footer, contact/booking forms, validation messages, and empty states.

Every item should be classified as:

1. Admin-editable content.
2. Stable interface copy that remains in code.
3. Sensitive/security copy that remains controlled by code.

### Editing and publishing workflow

- Pages list shows Draft/Published state, last editor, last published time, and preview thumbnail.
- Save changes to a revision without changing the live site.
- Preview a draft through an authenticated, no-store, no-index preview route.
- Publish atomically and invalidate only the affected cache tags.
- Maintain revision history with Compare, Restore as Draft, and Publish.
- Warn on navigation when there are unsaved changes.
- Plain text and controlled fields initially. If rich text is later added, use a strict allowlist renderer and never store/render arbitrary executable HTML.

## Private client gallery and full-quality downloads

### Client experience

Preserve the public site's visual language and existing responsive gallery/lightbox components. Add only the client-specific controls:

- A clear **Save full-quality photo** action on each photo card and in the lightbox.
- Full-quality/original wording so clients know the saved file is not the preview derivative.
- A short first-use explanation of how saving works on the detected phone/browser.
- Accessible labels, keyboard focus, large touch targets, progress/status announcements, and reduced-motion behavior.
- A capability-detected **Share/Save** enhancement on supported mobile browsers, with an authorized single-photo fallback.
- No ZIP requirement and no misleading “Save all to Photos” control.

### Important mobile constraint

A website cannot silently place files into the iOS or Android Photos library. The user must initiate the operation, and the operating system/browser decides which save targets are available. The reliable design is:

- **Preferred supported path:** offer a per-photo Share/Save action only after `navigator.canShare({ files })` confirms that the prepared image can be shared. The system share sheet lets the client choose an available destination such as Save Image/Photos when the platform exposes it.
- **Universal private fallback:** open an authorized full-resolution image view with concise press-and-hold/save instructions and a separate Download Original action. A conventional attachment download may go to Files/Downloads rather than Photos.
- **One photo per action:** each save remains an explicit client gesture. Do not trigger a sequence of automatic downloads, which browsers may block and which still would not guarantee Photos-library placement.

The UI should not promise silent camera-roll import. A native mobile app would be required for deeper system-level behavior.

### Individual full-quality delivery — approved

Requirements:

- Only READY assets can be delivered.
- Re-authorize the current share capability, password grant, expiry, revocation, gallery state, and optional policy on every original request.
- Keep the original in private storage and expose it only through the authorized application route or a very short-lived private signed URL created after authorization.
- Preserve the verified source hash and original quality; use a sanitized client filename.
- Return `no-store`, private caching, no-index, and no-referrer headers.
- Do not put capability tokens or private object keys into analytics, browser telemetry, audit metadata, or third-party resources.
- Record a completed delivery only after authorization succeeds; retries and failed transfers must not unexpectedly exhaust the link.
- Retire the manual ZIP upload/download controls after the individual-photo workflow passes mobile and authorization tests. Existing archive objects must be deleted through the durable deletion outbox, not abandoned.
- No generated ZIP, bundle worker, or gallery-bundle schema is required.

### Recommended download-limit policy

Replace the current request counter with individual-photo activity that distinguishes attempts from completed deliveries.

Recommended default: allow every photo in the gallery to be saved while the link is active, and track successful delivery by photo for Admin visibility. Expiry, password, publication state, and revocation remain the primary controls. If an optional limit is retained, define it as a limit on unique successfully delivered photos or explicitly labeled save attempts—not raw HTTP requests—so retries do not disable a valid client link.

### Share-link management

- Add an explicit `clientDeliveryEnabled` setting, defaulting to false for migrated galleries. Only an Admin can enable it after reviewing the gallery.
- Permit secure original-delivery links for a Published public or private gallery. Visibility controls public discovery/previews; the share grant independently controls originals.
- Create link with recipient label/email, optional password, expiry, and an optional clearly defined photo-save policy.
- Show Active, Expired, Revoked, or Limit Reached.
- Show created date, last access, successfully delivered photos, recent failures, and whether a password is set.
- Copy the capability only at creation; do not make stored tokens recoverable.
- “Replace link” creates a new capability and optionally revokes the old one.
- Passwords remain separate from emailed links.
- Revoke immediately through the existing grant-version/access model.

## Security and privacy requirements

These are release gates, not optional polish.

### Storage and media invariants

- Originals remain private for public and private galleries.
- Public pages receive only processed public derivatives.
- Private preview variants require authorized gallery access.
- Admin grids use derivatives and authenticated Admin routes, not source originals.
- No capability token, password, long-lived signed URL, object-storage credential, or private object key is serialized into client logs/telemetry.
- Validate filename, declared MIME type, byte signature, size, dimensions, hash, and decoding before an asset can become READY.
- Strip metadata from public preview derivatives; define whether clients receive untouched originals or metadata-scrubbed “full-resolution exports.” The current behavior is untouched originals.

### Authentication and authorization

- Verify the Admin session and authorization inside every read or mutation route; UI visibility is never authorization.
- Retain CSRF and origin verification for every mutation, including JSON upload and share-policy endpoints.
- Require or strongly enforce MFA for Admin access. If Google OAuth is the production method, require MFA on the authorized Google account; otherwise plan WebAuthn/TOTP.
- Use step-up confirmation for irreversible purge, gallery deletion, or mass link revocation.
- Rotate/revoke Admin sessions after credential or security-setting changes.

### Client access

- Capability tokens must have sufficient entropy and remain hashed at rest.
- Password checks use a slow password hash and rate-limited unlock attempts.
- Expiry, revocation, gallery active/published state, grant version, and any approved save policy are rechecked on every preview and original request.
- Apply `Referrer-Policy: no-referrer` and avoid external links/resources on token-bearing pages.
- Sanitize logs and error reporting so token-bearing paths are redacted.
- Use constant-behavior error responses where practical to avoid revealing whether a token or password exists.

### Audit, retention, and privacy

- Add security audit events for gallery/content/photo/share/download mutations and denied sensitive operations.
- Do not put passwords, capability tokens, original URLs, or image contents in audit metadata.
- Define retention for deleted photos, expired galleries, legacy archives, share-link activity, and client email addresses.
- Provide a documented purge operation that removes originals, variants, legacy archives, revisions where required, and related access grants.

## Performance plan

### Admin

- Server Components perform list/detail reads; client components are limited to upload, reorder, interactive forms, and live status.
- Fetch independent dashboard metrics in parallel and stream slow operational panels behind Suspense boundaries.
- Gallery list sends counts and one thumbnail only. Assets are fetched only in `/admin/galleries/[id]?tab=photos`.
- Cursor paginate galleries, assets, activity, and share links.
- Dynamically load heavy upload/reorder/editor code only on the relevant tab.
- Serialize only UI-needed fields; never pass full Prisma rows or private keys to client components.
- Use content visibility/windowing for long thumbnail lists, but retain accessible DOM semantics and keyboard controls.
- Poll processing states with visibility-aware exponential backoff; stop polling when the tab is hidden or all jobs are terminal.
- Use optimistic UI only for reversible metadata/order changes. Upload, delete, publish, revoke, and download-policy states remain server-authoritative.

### Client galleries

- Keep small/medium/large responsive preview variants and lazy loading.
- Preload only the likely first visible/lightbox image, not the whole gallery.
- Cursor paginate large galleries and preserve layout dimensions/placeholders to avoid visual shifting.
- Downloads bypass image transformation and return the private full-quality source only after authorization.
- Original delivery should use storage streaming/range support after authorization rather than buffering a full-quality file in application-server memory.
- Avoid third-party scripts and external resources on private token-bearing pages.

### Mobile Admin

- 44px or larger touch targets and sufficient spacing between destructive and primary actions.
- Sticky bottom action bar inside editors when Save/Publish is pending, accounting for device safe areas.
- Single-column forms and thumbnail grid on narrow screens; no critical workflow depends on hover.
- File-picker guidance, remaining file count, total size, pause/resume, retry failed only, and explicit “keep this tab open” messaging where browser limitations apply.
- Prevent accidental navigation during active uploads or unsaved edits.
- Test iOS Safari and Android Chrome with interrupted uploads, background/foreground transitions, slow connections, large originals, Share/Save support, press-and-hold fallback, and conventional downloads.

## Proposed data-model changes

Final field names should be validated against the current Prisma and Next.js versions before implementation.

### Gallery lifecycle

Add an explicit lifecycle instead of relying only on `isActive`:

```text
GalleryStatus = DRAFT | PUBLISHED | ARCHIVED
```

During migration, map `isActive=true` to Published and `isActive=false` to Draft unless the gallery is known to be archived. Keep a temporary compatibility layer, then remove or stop relying on `isActive`.

Add `clientDeliveryEnabled`, default false, so enabling full-quality private delivery is an explicit action independent of public/private visibility.

### Asset metadata and recoverable deletion

Add or equivalent:

- `altText`, `caption`, `focalX`, `focalY`.
- `deletedAt`, `purgeAfter`, `deletedByAdminId` or actor reference.
- Optional `clientFilename` if the client-facing name differs from the uploaded filename.

### Share-link metrics

Add or equivalent:

- A per-link/per-asset delivery record or privacy-minimized equivalent.
- Attempted/completed/failed outcome and timestamp without storing the capability token.
- Optional unique-photo limit only if the product still needs it after mobile testing.
- Optional human-readable `recipientLabel` that is not a secret.

### Content revisions

Add a revision/publish model rather than overwriting the only live row:

- Content key, version, structured payload or validated explicit fields.
- Draft/published status, author/actor, created time, published time.
- Asset references and deletion lifecycle.
- The live lookup resolves only the currently published revision.

A JSON payload is acceptable only behind a typed registry and schema validation; arbitrary JSON fields must not be rendered without validation.

## Delivery phases and review gates

### Phase 0 — Decisions, baseline, and security verification checkpoint

**Purpose:** lock the behavior before schema and UI work.

Work:

- Confirm the four product decisions listed in “Decisions required before implementation.”
- Inventory all public content fields/assets and current gallery data.
- Record baseline Admin queries, route sizes, upload behavior, and public/private gallery performance.
- Threat-model Admin upload, deletion, content preview/publish, capability links, individual original views/downloads, mobile Share/Save, and legacy archive retirement.
- Verify authorization, CSRF/origin enforcement, token hashing, cookie flags, rate limits, private-storage policies, signed-URL lifetime, no-index/referrer headers, log redaction, and download quota atomicity.
- Back up the database schema/data and verify object-storage recovery before migrations.

**Exit gate:** written security verification passes; decisions are approved; migration and rollback plan is reviewed. No Admin schema or client-download migration begins before this gate.

### Phase 1 — Admin shell and information architecture

**Implementation status (2026-08-04): Complete locally.** The responsive shell, summary-only reads, dedicated gallery routes and URL tabs, Pages entry/editor routes, Operations area, loading/error states, and action redirects are implemented. The production build and existing security/performance/mobile/operations gates pass. Final authenticated visual review on the owner account remains a release-review item.

**Purpose:** create the scalable structure without changing media behavior.

Work:

- New responsive Admin shell and navigation.
- Summary-only Dashboard and Gallery list.
- Dedicated new-gallery and gallery-workspace routes.
- URL-based tabs/filters, empty/error/loading states, mobile navigation, and accessible focus behavior.
- Move media jobs and storage cleanup to Operations.

**Exit gate:** existing gallery actions remain functional; list no longer loads asset arrays/components per gallery; keyboard/mobile navigation tests pass.

### Phase 2 — Gallery workspace and photo management

**Implementation status (2026-08-04): Code complete behind a disabled-by-default feature flag.** The lifecycle migration, photo workspace, metadata and batch actions, Recycle Bin, scheduled purge, activity audit, and authenticated gallery preview are implemented and pass the project verification suite. The migration remains intentionally unapplied until every Phase 0 security verification checkpoint passes; the current database and public site therefore continue using the compatibility path.

**Purpose:** provide the requested gallery/category/add/remove workflow.

Work:

- Details, Photos, and Activity tabs.
- Draft/Published/Archived lifecycle migration.
- Thumbnail manager, per-file upload status, retries, batch actions, metadata, and ordering.
- Recycle Bin/restore/purge workflow and immediate removal from authorized download results.
- Public/private previews.

**Exit gate:** create a gallery in every existing category; upload/resume/retry/reorder/remove/restore/publish from desktop and phone; originals remain private; no data loss under interrupted operations.

### Phase 3 — Pages/content management

**Implementation status (2026-08-04): Code complete behind a disabled-by-default feature flag.** The typed content inventory, immutable draft revisions, private draft images, authenticated preview, explicit publish, revision comparison/history, restore-as-draft rollback, SEO/share metadata, global site chrome, and per-key cache invalidation are implemented. The additive migration remains intentionally unapplied until every Phase 0 infrastructure and security checkpoint passes.

**Purpose:** make all agreed public content and assets editable safely.

Work:

- Complete content inventory and typed page registry.
- Pages list and dedicated editor.
- Global navigation/footer/contact/social settings.
- SEO/share fields, image alt/focal controls, draft preview, revisions, publish, and rollback.
- Targeted cache invalidation.

**Exit gate:** every inventory item is either editable or explicitly classified as code-controlled; draft preview is private; live pages change only on Publish; rollback is verified.

### Phase 4 — Client links and individual full-quality saving

**Implementation status (2026-08-05): Code complete behind a disabled-by-default feature flag.** Private-gallery delivery activation, atomic link replacement/revocation, bounded per-photo delivery records, verified range-aware original streaming, grid/lightbox Save actions, capability-detected two-gesture Web Share, original-view fallback, mobile guidance, and legacy ZIP retirement/cleanup are implemented. The additive migration remains unapplied and the feature remains disabled until the Phase 0 isolated-staging and real-device gates pass.

**Purpose:** complete private client delivery while preserving the current site UI.

Work:

- Client Access and Downloads tabs.
- Improved share-link status, creation, replacement, revoke, activity, and per-photo delivery records.
- Per-photo and lightbox Save Full Quality actions, mobile instructions, capability-detected Web Share enhancement, and authorized original-view/download fallback.
- Range/streaming or short-lived authorized storage delivery without buffering originals in application memory.
- Removal of ZIP creation/upload from the normal Admin workflow and safe deletion of legacy archive objects through the existing outbox.

**Exit gate:** revoked/expired/invalid links cannot fetch previews or originals; full-quality deliveries match verified source hashes; removed photos are immediately unavailable; iOS/Android Share/Save and fallback paths are documented and tested.

### Phase 5 — Hardening, accessibility, and performance

**Purpose:** validate the integrated system under realistic scale and failure.

Work:

- Complete mutation/security audit coverage and retention jobs.
- MFA/step-up controls and destructive-action review.
- Long-gallery performance, original-transfer load, failure/retry, slow-network, and interruption tests.
- Keyboard, screen-reader, focus, contrast, reduced-motion, safe-area, and touch-target audit.
- Production telemetry for processing delay, photo-save/download failures, and Admin web vitals without leaking private identifiers.

**Exit gate:** security checklist, accessibility checks, performance budgets, recovery drills, and production rollback plan pass.

### Phase 6 — Migration and release

**Purpose:** move existing content/galleries safely and remove temporary compatibility paths.

**Local implementation:** complete. See `ADMIN-PHASE-6-IMPLEMENTATION.md`. Database migration, storage/delivery/device evidence, observation, and flag activation remain external release gates.

Work:

- Backfill gallery lifecycle, asset metadata defaults, content revisions, and optional per-photo delivery records.
- Verify every active private gallery can authorize, stream, and save a synthetic or approved original through the new individual-photo path.
- Keep existing manual ZIP controls available only during the short compatibility window, then hide the route/UI and delete legacy archive objects through the storage-deletion outbox.
- Release behind feature flags, monitor, then retire old Admin cards and manual-archive paths.

**Exit gate:** migration report accounts for every gallery, asset, link, content record, and legacy archive; no original object is orphaned or exposed; rollback remains available through the observation window.

## Acceptance criteria

The integrated project is complete when:

1. An Admin can create a Draft gallery in any existing category, add details, upload photos, order them, and publish it without using the database or storage console.
2. Uploads can pause/resume after an interruption, show per-file status, and never publish an unverified source.
3. An Admin can remove a photo safely, restore it during retention, or explicitly purge it; all public/private views and original-download results update correctly.
4. The Gallery list remains fast with many galleries because it loads summaries, not photo managers.
5. Every approved public-page title, text, link, metadata field, and asset can be edited through a structured editor with draft preview, publish, revision history, and rollback.
6. An Admin can create, replace, copy, email, expire, limit, and revoke a private client link.
7. A client link uses the current website gallery UI, displays optimized previews, and gives every photo a verified full-quality Save/Share action plus an authorized fallback.
8. A revoked, expired, unpublished, or invalid link cannot retrieve previews or originals, even with a previously discovered endpoint.
9. Removing a photo makes its original immediately unavailable through every client route; restoring it returns access only after the asset is valid and READY.
10. No public/Admin grid renders private originals; no token/password/private object key is exposed to client telemetry or logs.
11. Core Admin and client workflows pass iOS Safari, Android Chrome, desktop keyboard, slow-network, interrupted-upload, and large-gallery tests.

## Approved decision record

### 1. Client photo delivery — approved and revised

Use individual full-quality Save/Share actions for every photo. Do not build a generated ZIP pipeline and do not make ZIP files part of the normal client experience. Retire existing manual archive support after the individual workflow is verified.

### 2. Page editor type

Approved: structured fields and assets defined per page, with draft/revision/publish support.

### 3. Gallery lifecycle

Approved: Draft → Published → Archived, independent of Public/Private visibility.

### 4. Download/save policy — revised consequence of Decision 1

Allow all gallery photos to be saved while the private link remains authorized. Track successful per-photo delivery for activity, but do not use raw HTTP request counts that penalize retries. Expiry, password protection, publication state, and revocation are the default controls. An optional unique-photo policy can be added later only if real client use requires it.

### 5. Deleted-photo retention

Approved: 30-day Recycle Bin, with immediate removal from views and an explicit Purge Now action.

## Explicitly out of scope for the first implementation

- A free-form visual page builder.
- Native iOS/Android applications or silent camera-roll import.
- Payments, print ordering, client favorites/proofing/comments, or watermark approval workflows.
- Multiple Admin roles and granular team permissions, unless more than one Admin/operator is needed now.
- Replacing the current public-site visual design.

These can be layered onto the proposed architecture later without blocking the requested Admin, content, and client-download workflows.

## Phase 0 gate

The product decisions are approved. Phase 0 continues with the security verification, data/content inventory, migration/rollback design, and a written readiness result. Admin schema and client-download implementation begin only after that checkpoint is reported.
