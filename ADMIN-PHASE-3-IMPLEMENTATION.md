# Admin Phase 3 — Structured Page Content

**Project:** Alex Bereanu Photography  
**Date:** 2026-08-04  
**Status:** Implemented and verified behind a disabled feature flag  
**Database migration:** Created but intentionally not applied  
**Database or object-storage mutation:** None during implementation and verification

## User prompt

> continue with phase 3

This implements Phase 3 from `ADMIN-EXPERIENCE-INTEGRATION-PLAN.md`. It preserves the Phase 0 migration checkpoint and does not activate the new schema against the shared database.

## Outcome

The Pages area is now designed around immutable structured revisions rather than direct edits to the live website. An Admin can save a Draft, privately preview it, compare it with the published revision, explicitly Publish it, inspect bounded revision history, and restore any historical version into a new Draft.

`ADMIN_CONTENT_PHASE3_ENABLED=false` remains the default. While disabled, the existing immediate-publish editor and old `SiteContent` queries continue operating without reading any new column.

## Content inventory

| Area | Phase 3 classification |
|---|---|
| Brand name, tagline, default metadata | Admin-editable structured content |
| Desktop/mobile navigation labels and portfolio-category labels | Admin-editable; destinations remain code-controlled |
| Footer brand, tagline, supporting note, and Instagram destination | Admin-editable structured content |
| Homepage About title, paragraph, image, alt text, focal point, and metadata | Admin-editable structured content |
| Homepage Connect title and introduction | Admin-editable structured content |
| Portfolio index title, introduction, and metadata | Admin-editable structured content |
| Six portfolio-category heroes, inquiries, images, alt/focal controls, and metadata | Admin-editable structured content |
| Standalone wedding landing title, section copy, CTA, and metadata | Admin-editable structured content |
| Private-gallery introduction, save guidance, labels, and empty state | Admin-editable non-security copy |
| Individual gallery titles, descriptions, category, and visibility | Already editable in the Gallery workspace |
| Route destinations, form field semantics, authorization errors, rate-limit messages, CSRF/Turnstile text, and other security copy | Deliberately code-controlled |
| Public-gallery processing/error empty states | Stable interface copy; deliberately code-controlled |

The registry contains no HTML or rich-text field. React renders escaped plain text, URLs are limited to HTTP/HTTPS, field names are allowlisted, and every value has a per-field length bound.

## Revision model

- `SiteContentRevisionStatus`: Draft, Published, and Superseded.
- Immutable versioned revisions per typed content key.
- Explicit published revision pointer on the existing `SiteContent` live record.
- JSON payloads are accepted only after validation against the code-defined registry.
- Page image derivatives, storage area, alt text, focal point, SEO title, and SEO description are revisioned.
- Restore never rewrites history; it creates a new Draft linked to its source revision.
- The migration backfills every existing `SiteContent` row as Published revision 1.

The additive migration is:

`prisma/migrations/20260804213000_admin_phase3_content_revisions/migration.sql`

## Draft and publish behavior

### Save Draft

- Authenticates inside the mutation and verifies CSRF/request origin.
- Validates only fields declared by the selected registry entry.
- Creates a new immutable Draft under a serializable transaction.
- Does not update the live fields and does not invalidate public caches.
- Generates draft image derivatives in private storage only.
- Records a privacy-minimized security audit event.

### Preview

- Requires an authenticated Admin session.
- Is `noindex`, `nofollow`, `nocache`, and dynamically rendered.
- Streams draft derivatives through an authenticated private/no-store route.
- Uses the public site’s editorial header, content composition, image crop, and footer language.
- Never publishes a private draft object through the public image domain.

### Publish

- Accepts only a current Draft revision.
- Copies private small/medium WebP derivatives into new immutable public keys.
- Atomically updates the live `SiteContent` record, published payload, revision pointer, metadata, image references, and revision states.
- Moves the original private draft derivatives into the durable storage-deletion outbox and attempts immediate cleanup.
- Retains historical published public assets so a historical revision can be restored and previewed safely.
- Invalidates only the affected content key and its declared public path.
- Updates public SEO title, description, canonical URL, and Open Graph data; an existing page image is reused as the social image where available.

## Admin experience

- Pages are grouped as Global, Homepage, Portfolio, Wedding landing, and Client gallery.
- Cards show live/default state, newest Draft, publication time, and revision count.
- Editors use visible labels, helper text, bounded inputs, responsive two-column layouts, and a mobile safe-area-aware sticky Draft action.
- Unsaved edits activate a browser navigation warning and an accessible visible status.
- Each saved revision has deep links for View and private Preview.
- The comparison panel marks every field as Changed or Same and shows the current live value.
- History reads are bounded to 30 revisions; Pages summary counts and latest-draft reads remain bounded instead of loading every revision payload.
- Publish requires explicit confirmation. Restore creates a new Draft.

## Public integration

- Brand and footer content now flow through the published content service.
- Desktop/mobile headers use editable brand and navigation labels.
- Category-navigation labels are editable without allowing arbitrary destinations.
- Homepage, portfolio index, six category pages, and the wedding landing use published SEO metadata.
- Category/homepage images honor published focal points.
- Private client galleries use the published non-security introduction and label content.
- Published content is cached per key and invalidated per key; the global compatibility tag remains available for the legacy editor.

## Security and compatibility boundaries

- All three new POST routes authenticate and verify CSRF/origin inside the handler.
- All Phase 3 actions return a safe error while the feature flag is disabled.
- The legacy direct-publish action refuses requests after Phase 3 activation, preventing a workflow bypass.
- Draft asset responses are private, no-store, same-origin, no-sniff, and no-index.
- No arbitrary HTML, script, redirect destination, navigation destination, or canonical URL is accepted from Admin fields.
- Actor identifiers are HMAC-minimized before revision attribution/auditing.
- The production verifier requires a direct TLS-verified migration URL before either schema-backed Admin phase can be enabled.
- Code can deploy before the migration with both feature flags disabled; legacy database queries use explicit old-column selects.

## Activation sequence

1. Complete and record the Phase 0 encrypted backup and isolated-restore test.
2. Verify the direct PostgreSQL migration endpoint with `sslmode=verify-full`.
3. Apply the Phase 2 and then Phase 3 migrations to isolated staging.
4. Compare gallery, asset, share-link, content-row, and revision backfill invariants.
5. Deploy compatible code with `ADMIN_CONTENT_PHASE3_ENABLED=false`.
6. Enable Phase 3 in staging and test Draft → Preview → Publish → Restore on every registry group.
7. Confirm draft objects are inaccessible publicly and published metadata/cache changes are limited to the expected pages.
8. Repeat the approved sequence in production, then enable the flag during the monitored release window.

## Verification results

| Check | Result |
|---|---|
| `npm run db:generate` | Pass — Prisma Client 7.9.1 generated |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run admin:phase0:verify` | Pass — 33 authenticated Admin POST routes |
| `npm run admin:phase2:verify` | Pass |
| `npm run admin:phase3:verify` | Pass — typed registry, private drafts, publish, history, preview, and rollback |
| `npm run quality:verify` | Pass — security, media, performance, mobile/resume, and operations |
| `npm run build` | Pass — Next.js 16.2.12 production build and Phase 3 routes compiled |
| `npm run dependency:policy` | Pass — reported findings remain within accepted policy |
| Local public routes | Pass — homepage, portfolio, and wedding landing returned `200` |
| Local unauthenticated Pages entry | Pass — redirected securely to Admin login |

## Deliberately deferred

- Applying or enabling the migration before the Phase 0 infrastructure gate passes.
- A free-form page builder, arbitrary HTML, or user-controlled navigation destinations.
- A separate social-card image uploader; the published page image supplies Open Graph imagery in this phase.
- Revision-retention cleanup for never-published abandoned Drafts; this belongs with the retention/hardening work.
- Client-facing per-photo Save/Share delivery and delivery records, which belong to Phase 4.

## Review checkpoint

Phase 3 code is complete but remains on the compatibility path until the schema gate is cleared. The new Pages interface cannot be exercised against the current shared database without first applying the migration in isolated staging and explicitly enabling the feature flag.
