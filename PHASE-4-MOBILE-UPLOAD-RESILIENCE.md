# Phase 4 Mobile Functionality and Upload Resilience

**Project:** Alex Bereanu Photography  
**Implementation date:** 31 July 2026  
**Repository:** `E:\github\alex-bereanu`  
**Local implementation status:** Complete  
**Production database/storage mutation:** Not performed  
**Live staging exit gate:** Pending the migration and configured R2/database environment

> **Subsequent update (31 July 2026):** Phase 5 operational security and performance controls are now implemented locally and recorded in `PHASE-5-OPERATIONS-SECURITY.md`. Its production configuration, provider-policy, staging, restore-drill, and external penetration-test gates remain pending.

## User prompts

> look at the the current website implementation and create a plan on how we can continue to develop it into a better version. Focus on improving image loading and overall performance of the website. UI looks good for now, but also take into consideration mobile functionality and performance. Security must also be key, as it will hold valuable personal photos. Before starting to implement the plan, let me review it and we can decide on the best approach. Consider all the relevant skills that you might need in developing the plan

> output all audit as a markdown file and make sure to include my prompt

> sounds good, let's implement Phase 1, including the security verification checkpoint before beginning the image pipeline migration

> looks good, continue with the rest of migration

> continue with phase 3

> continue with phase 4

## Executive result

Phase 4 is implemented in the local worktree. The site now has an accessible mobile navigation drawer, mobile-safe forms and gallery controls, a lighter touch-oriented lightbox, keyboard/touch admin ordering, guarded destructive actions, reload-safe photo upload checkpoints, and true multipart ZIP upload resume from R2-confirmed parts.

The implementation preserves the private-media protections established in Phases 1 and 2. Browser persistence contains only bounded, non-secret checkpoint metadata; signed URLs, object keys, filenames, photo bytes, credentials, and gallery access tokens are not stored. Every resume or multipart operation re-authenticates the administrator, validates CSRF, binds the opaque session to its gallery/kind/hash/size, and verifies expiry and server state.

No production migration was applied, no real photo or archive was uploaded, and no R2 multipart upload was created or aborted during this task. The complete upload-resume exit gate therefore still requires a staging environment with the Phase 4 migration, R2, database, and media worker configured.

## Guidance and skills applied

- The installed Next.js 16.2.12 documentation was read before implementation, including Server/Client Component boundaries, forms, lazy loading, route handlers, and navigation APIs.
- Next.js best-practice guidance shaped the route-handler boundaries and kept interactive upload/navigation code isolated to Client Components.
- React and Vercel performance guidance shaped bounded concurrency, functional state updates, versioned local storage, passive interaction handling, and deferred lightbox features.
- UI/UX and web-interface guidance shaped 44px touch targets, visible labels, focus management, safe areas, reduced motion, error announcements, and keyboard parity.
- The UI/UX skill's optional search script was unavailable at its referenced path, so its documented rule set and the current Web Interface Guidelines were applied directly.
- The in-app browser was used for mobile layout, overflow, focus isolation, focus return, form sizing, and orientation checks.

## Mobile navigation and global behavior

- Replaced duplicated page headers with one responsive `SiteHeader`.
- Desktop navigation remains unchanged above the mobile breakpoint.
- The mobile drawer uses a 48px menu control, explicit accessible name, `aria-expanded`, and `aria-controls`.
- Opening the drawer locks page scrolling and marks the main page inert and hidden from assistive technology.
- Focus moves into the dialog, is trapped while open, and returns to the menu control after Escape, backdrop, close-button, or navigation dismissal.
- The drawer accounts for device safe areas and contains overscroll.
- A keyboard-visible skip link now targets the main page content.
- Global focus-visible styling, reduced-motion behavior, coarse-pointer touch targets, and narrow-screen overflow protections were added.

## Forms and input behavior

- Contact, booking, login, setup, gallery creation, gallery updates, and share-link controls now use durable visible labels.
- Email, telephone, username, password, and name fields include appropriate input types, input modes, and autocomplete hints.
- Mobile text inputs retain a 16px font size to avoid unwanted browser zoom.
- Primary actions and persistent admin navigation meet a minimum 44px touch target.
- Submission failures are announced as alerts and receive focus where appropriate; progress and success text use live status announcements.
- Supporting instructions are associated with their controls rather than relying on placeholder text.

## Mobile gallery and lightbox

- Mobile/coarse-pointer lightboxes request medium derivatives rather than desktop-sized large derivatives.
- The thumbnail plugin is omitted on mobile to preserve viewport space and avoid unnecessary thumbnail work.
- Mobile preloading is reduced to one adjacent image; desktop retains two.
- Pulling vertically closes the mobile lightbox while normal horizontal navigation remains available.
- Animation duration is removed for people who prefer reduced motion.
- Controls and captions account for safe-area insets.
- Closing returns focus to the gallery tile that opened the lightbox.

## Admin ordering and destructive actions

- Gallery assets can be reordered with 44px Move Up/Move Down controls on touch devices.
- Focused asset rows also support `Alt+ArrowUp` and `Alt+ArrowDown` without requiring drag precision.
- Reorder saves expose live success/failure feedback.
- Permanent photo, gallery, and archive deletion now requires a deliberate two-step confirmation.
- The existing authenticated, CSRF-protected, durable deletion outbox remains the actual storage-deletion boundary.

## Resumable photo uploads

- Up to three photos hash and upload concurrently so large selections do not serialize every transfer.
- Each file uses bounded retries with exponential delay and waits for connectivity to return after an offline interruption.
- Photo upload progress is visible per file and across the selection.
- Pause/resume aborts only the active browser requests; the server-side sessions remain available until expiry.
- Successful browser-to-R2 transfers are finalized and queued per file, so a later failure does not discard earlier successes.
- Reload-safe checkpoints let a reselected file resume its existing server session or skip an already completed upload.
- The existing authenticated application relay remains a controlled fallback only for files within its 20MB limit.
- A before-unload warning protects active work.

### Photo checkpoint contents

The versioned browser record contains only:

- Gallery ID.
- Upload kind.
- SHA-256 digest.
- File size.
- Opaque upload-session ID.
- Checkpoint status and update time.

It never stores the image, filename, storage key, signed upload URL, password, cookie, CSRF value, or access token. Entries expire after seven days and storage is bounded.

## Multipart archive uploads

- ZIP archives use 16MB R2 multipart parts with at most three parts uploading at once.
- Every part uses bounded retries and obtains a short-lived signed URL just before transfer.
- On reload, the administrator reselects the same ZIP; its hash and size bind it to the existing opaque server session.
- Resume state is reconstructed from R2's confirmed parts, not trusted browser claims.
- Before completion, the server lists parts again, verifies contiguous part numbers and exact expected sizes, and then completes the R2 upload.
- Pause preserves confirmed parts. “Cancel and discard parts” explicitly aborts the R2 multipart upload and marks the session aborted.
- Expired multipart sessions are reconciled server-side: outstanding R2 multipart uploads are aborted and associated objects are placed in the deletion workflow.
- A before-unload warning protects an active multipart transfer.

## Upload-session security boundary

- All Phase 4 endpoints require a current admin session.
- State-changing requests require the existing same-origin/CSRF validation.
- Resume requires an exact match on gallery, upload kind, SHA-256 digest, and byte size under a current administrator session.
- Session IDs are opaque and server authorization is rechecked on every operation.
- Expired, failed, aborted, or mismatched sessions cannot be resumed.
- R2 object keys remain server-only.
- Server-side R2 part listing is authoritative for multipart completion.
- Route responses are `private, no-store`.
- HEIC/HEIF is rejected early and explicitly. The current supported mobile policy is to upload JPEG/PNG/WebP; client-side conversion was not introduced because it could lose metadata or quality without an approved product policy.

## Schema and operations

The unapplied migration is:

`prisma/migrations/20260731190000_phase4_resumable_uploads/migration.sql`

It adds multipart identifiers/timestamps/part sizing and the `ABORTED` upload state. The schema and generated Prisma client validate locally, but the migration was intentionally not applied to any configured database.

Operational defaults:

- Photo session lifetime: 24 hours.
- Multipart archive session lifetime: 7 days.
- Multipart part size: 16MB.
- Photo upload concurrency: 3.
- Multipart upload concurrency: 3.
- Retry attempts: 3.

## Verification results

| Check | Result | Command/evidence |
| --- | --- | --- |
| ESLint | Pass, zero warnings | `npm run lint` |
| TypeScript | Pass | `npm run typecheck` |
| Production build | Pass, 41 static pages generated, no build warning | `npm run build` |
| Prisma schema | Pass | `node scripts/prisma-env-runner.mjs validate` |
| Phase 1 security regression | Pass | `node scripts/verify-phase1-security.mjs` |
| Phase 2 media regression | Pass | `node scripts/verify-phase2-media.mjs` |
| Phase 3 performance regression | Pass | `node scripts/verify-phase3-performance.mjs` |
| Phase 4 experience/resume regression | Pass | `node scripts/verify-phase4-mobile-resume.mjs` |
| Combined gate | Pass | `npm run quality:verify` |
| Dependency audit | Two high findings; no fix currently available | Nested `sharp@0.34.5` bundled by Next.js; application `sharp` is 0.35.3 and Next image optimization remains disabled |
| Production/database mutation | Not performed | No migration, backfill, upload, deletion, or form submission |

## Browser verification

The development site was inspected in the in-app browser without submitting forms or accessing private media:

- `320×640`: no horizontal overflow after accounting for the scrollbar; menu control is 48×48px.
- `375×812`: no horizontal overflow; the mobile drawer is available.
- `700×375` landscape: no horizontal overflow; desktop navigation stays hidden and the mobile control remains available.
- Drawer open state: main content is inert and `aria-hidden`; focus starts within the dialog.
- Escape: drawer closes, main content is restored, and focus returns to “Open navigation menu.”
- Admin login at 375px: fields are 44px high with 16px text and correct autocomplete values.
- Browser console: no application errors; only the pre-existing PostgreSQL SSL-mode warning appeared on server output.

Private-gallery/lightbox data and real upload resume were not exercised because the local database has not received the approved migrations. Static regression checks cover those code boundaries; staging must cover the network/storage lifecycle.

## Required staging checkpoint before release

1. Apply Phases 1, 2, and 4 migrations in order to an isolated staging database and verify the migration backup/rollback procedure.
2. Configure a private staging R2 bucket, worker secret, malware scanner, Turnstile, and `sslmode=verify-full` database connection.
3. Upload at least 50 mixed-size JPEG/PNG/WebP photos; inject two transfer failures and verify only failed/incomplete files resume.
4. Reload mid-photo upload, reselect the same files, and verify completed files are not retransmitted.
5. Upload a large ZIP, interrupt after several parts, reload, and confirm R2-listed parts resume instead of restarting at byte zero.
6. Pause, resume, cancel, and expire multipart sessions; verify multipart abort and deletion reconciliation.
7. Verify mismatched hash, size, gallery, kind, expired session, and forged part metadata are rejected.
8. Complete scanning and derivative processing; verify only `READY` derivatives become visible and originals remain private.
9. Test private-gallery lightbox gestures, rotation, safe areas, reduced motion, access expiry, share revocation, and original downloads on physical iOS and Android devices.
10. Run Slow 4G/offline/background-resume checks and record transfer counts, bytes, failures, and completion times.

Phase 4 should not be considered production-released until this staging checkpoint passes.

## Remaining work for Phase 5

- Production monitoring, alerting, retention automation, backup/restore drills, and incident procedures.
- Rate-limit and audit-event dashboards for authentication, gallery access, upload, download, worker, and deletion failures.
- Automated browser/Lighthouse budgets in CI across representative mobile routes.
- Resolution of the nested Next.js Sharp advisory when an upstream-compatible release becomes available.
- Content Security Policy hardening and production header verification against the deployed CDN/platform.
- Periodic access-control, share-link, deletion, and restore exercises with documented evidence.
