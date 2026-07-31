# Phase 3 Performance Migration

**Project:** Alex Bereanu Photography  
**Implementation date:** 31 July 2026  
**Repository:** `E:\github\alex-bereanu`  
**Local implementation status:** Complete  
**Production data/storage mutation:** Not performed

## User prompts

> look at the the current website implementation and create a plan on how we can continue to develop it into a better version. Focus on improving image loading and overall performance of the website. UI looks good for now, but also take into consideration mobile functionality and performance. Security must also be key, as it will hold valuable personal photos. Before starting to implement the plan, let me review it and we can decide on the best approach. Consider all the relevant skills that you might need in developing the plan

> output all audit as a markdown file and make sure to include my prompt

> sounds good, let's implement Phase 1, including the security verification checkpoint before beginning the image pipeline migration

> looks good, continue with the rest of migration

> continue with phase 3

## Executive result

Phase 3 is implemented in the local worktree. Public, private, and expanded admin galleries now query and serialize at most 40 photos initially and continue through cursor-based pages. Gallery size therefore no longer causes an unbounded initial database result, React payload, image grid, or browser DOM.

Public read paths now use bounded projections, batched queries, request deduplication, and tagged data caches with explicit invalidation after content and gallery mutations. The lightbox and its plugins are isolated in an interaction-loaded client chunk, Turnstile's external script is deferred until a form approaches the viewport or receives interaction, and the homepage mosaic is rendered as a Server Component. Exactly the first gallery image receives eager/high-priority treatment.

The private-media protections from Phases 1 and 2 remain intact. Pagination responses revalidate current gallery access and return authenticated same-origin derivative URLs rather than storage keys. No database migration was applied, no backfill was run, and no R2 object was created, copied, or deleted during this phase.

## Implemented data and payload boundaries

### Public galleries

- Public gallery detail queries request 41 rows, return 40, and use the extra row only to determine whether a next cursor exists.
- `GET /api/public-galleries/[slug]/assets?cursor=...` returns the next minimal photo DTO page and is explicitly `no-store`.
- Gallery metadata and the initial page share a React request cache, avoiding duplicate work during metadata/page rendering.
- Category pages query gallery metadata and one cover separately from a category-wide showcase pool capped at 40 photos. They no longer flatten every asset from every gallery.
- Portfolio summary counts and cover identifiers are consolidated into one aggregate query followed by one bounded cover lookup.
- Public DTOs select only the derivative metadata needed by the UI and do not serialize source-object keys.

### Private galleries

- Private gallery access returns at most 40 initial `READY` assets plus `assetCount` and `nextCursor`.
- `GET /api/gallery-media/assets?cursor=...` rechecks the current access cookie and gallery state on every page request.
- The private pagination response uses `private, no-store`, `Vary: Cookie`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow`.
- Appended photos use authenticated same-origin `small`, `medium`, and `large` delivery routes. No private storage key or public R2 URL is returned.
- Individual photo downloads remain available from the lightbox. The archive/ZIP remains the bulk-download path, avoiding a browser request storm.

### Administration

- The admin gallery list does not load asset rows for collapsed galleries.
- Opening a gallery loads at most 40 asset rows initially and exposes a cursor for subsequent pages.
- `GET /admin/actions/galleries/assets-page` is admin-authenticated, returns a minimal DTO, and is `private, no-store`.
- Reordering validates and updates the loaded subset, so a paginated gallery no longer requires serializing every asset merely to reorder visible rows.

## Caching and query consolidation

- Public gallery/category/portfolio reads use a 15-minute tagged data cache.
- Site-content reads use a one-hour tagged data cache.
- `getSiteContents()` batches multiple content keys, including homepage about/contact content, rather than issuing one query per key.
- React `cache()` deduplicates matching reads within one server render.
- Gallery create, update, delete, asset delete/reorder/finalization, media-worker processing, and admin media-job processing invalidate the public gallery tag.
- Site-content mutation invalidates the site-content tag.
- Invalidation uses immediate tag expiry so visitors do not wait for the normal revalidation interval after an approved mutation.
- Private gallery and admin responses remain uncached because authorization and current state must be checked per request.

The portfolio route intentionally remains dynamically rendered. An attempted build-time render correctly exposed that the currently configured database has not received the Phase 2 schema migration (`Asset.status` is absent). The route was restored to dynamic rendering while its underlying public reads remain tagged and cached. This preserves deterministic builds and the approved migration boundary; the failed build performed a read only.

## Browser and mobile performance

- The heavy lightbox implementation, plugins, and styles live in `gallery-lightbox-overlay.tsx` and are loaded with `next/dynamic` only when opened or deliberately prefetched by gallery hover/focus.
- Public and private grids retain responsive derivative selection: small grid images, medium mobile lightbox images, and large desktop lightbox images.
- Exactly the first image in each initial gallery grid is eager with high fetch priority; all remaining images are lazy/normal priority.
- Additional photos append only after an explicit "Load more photos" action, keeping mobile network, memory, and DOM work bounded.
- The homepage mosaic no longer hydrates a client component merely to memoize a static shuffle.
- Turnstile's external script is requested only when the field is within 300px of the viewport or the user interacts with it. Above-the-fold login forms still load it when needed.
- The unused Geist Mono webfont was removed in favor of system font stacks.
- Public R2 preconnect hints are route-local rather than emitted on private and admin pages.
- Gallery tiles use compact blur placeholders and `content-visibility` where appropriate to reduce off-screen rendering work.

## Security properties retained

- Only `READY` assets enter public or private gallery pages.
- Public pagination exposes only public derivative URLs.
- Private pagination requires a valid, current gallery grant and exposes only same-origin authenticated URLs.
- Source originals and archives remain private; there is no original-image preview fallback.
- Cursor endpoints validate inputs and return bounded responses.
- Private/admin cursor endpoints are non-cacheable; public cursor responses are also `no-store` to prevent accidental intermediary retention of API payloads.
- Cache invalidation is attached to every current mutation path that can change public gallery or site-content output.

## Verification results

| Check | Result | Command/evidence |
| --- | --- | --- |
| ESLint | Pass, zero warnings | `npm run lint` |
| TypeScript | Pass | `npm run typecheck` |
| Phase 1 security regression gate | Pass | `node scripts/verify-phase1-security.mjs` |
| Phase 2 media regression gate | Pass | `node scripts/verify-phase2-media.mjs` |
| Phase 3 performance regression gate | Pass | `node scripts/verify-phase3-performance.mjs` |
| Combined quality gate | Pass | `npm run quality:verify` |
| Prisma schema validation | Pass | `node scripts/prisma-env-runner.mjs validate` |
| Production build | Pass | `npm run build` using Next.js 16.2.12; 36 static pages generated |
| Next bundle analyzer | Pass | `npx next experimental-analyze --output`; route data confirms the lightbox dependency is limited to gallery routes |
| Git whitespace check | Pass | `git diff --check`; only existing Windows LF/CRLF notices |
| Production dependency audit | Conditional hold | Two linked high findings from Next's nested Sharp 0.34.5; no npm fix is currently available |
| Live 1,000-photo/Lighthouse test | Not performed | Requires a migrated staging database and representative R2 data |

The Phase 3 regression script checks the 40-photo query boundary, cursor routes and cache policies, dynamic lightbox boundary, removal of multi-download behavior, Server Component homepage, bounded admin payload, batched/tagged content reads, deferred Turnstile loading, and mutation invalidation. It is a code-level gate, not a replacement for staging measurements.

## Exit-gate assessment

| Phase 3 exit gate | Status |
| --- | --- |
| A 1,000-photo gallery initially serializes no more than 30-40 photo DTOs | Implemented and statically verified at 40; staging dataset proof remains pending |
| Initial payload and DOM remain bounded as gallery size grows | Implemented through database cursor pagination |
| Exactly one image per gallery page has high fetch priority | Implemented and statically verified |
| Lightbox/plugin JavaScript is not requested before interaction or deliberate preload | Implemented through a dedicated dynamic boundary; confirm with a staging network trace |
| Public caches invalidate after gallery/content changes | Implemented and statically verified |

## Remaining release gates

1. Rehearse and apply the Phase 1/2 database migrations in staging before pointing this code at representative gallery data.
2. Seed or clone a synthetic 1,000-photo gallery and record initial HTML/RSC transfer size, DOM node count, memory, request count, LCP, INP, and CLS on a throttled mobile profile.
3. Confirm in a browser network trace that the lightbox chunk is absent until hover/focus preload or open, and that only one initial image receives high priority.
4. Exercise every cursor route through multiple pages, including deleted cursors, expired/revoked private grants, gallery deactivation, and concurrent asset changes.
5. Verify cache invalidation after each public mutation in a multi-instance staging deployment.
6. Configure the PostgreSQL connection string with explicit `sslmode=verify-full`; the current driver warns that `sslmode=require` compatibility semantics will change in a future major version.
7. Continue tracking Next's nested Sharp advisory. Application-owned image processing uses Sharp 0.35.3 and the Next image optimizer remains disabled as a compensating control.

## Work intentionally left for later phases

Phase 3 does not claim the Phase 4 mobile-navigation, touch-target, form-accessibility, mobile-lightbox, admin keyboard/touch ordering, or resumable/multipart upload work. It also does not implement Phase 5 distributed rate limiting, audit events, retention automation, stricter CSP rollout, production monitoring, or penetration testing.

## Files to review first

- `src/server/services/public-gallery.ts`
- `src/server/services/gallery-access.ts`
- `src/server/services/site-content.ts`
- `src/server/services/public-cache.ts`
- `src/app/api/public-galleries/[slug]/assets/route.ts`
- `src/app/api/gallery-media/assets/route.ts`
- `src/app/admin/actions/galleries/assets-page/route.ts`
- `src/components/public-gallery-mosaic.tsx`
- `src/components/gallery-lightbox.tsx`
- `src/components/gallery-lightbox-overlay.tsx`
- `src/components/admin-asset-manager.tsx`
- `src/components/turnstile-field.tsx`
- `scripts/verify-phase3-performance.mjs`

The original audit remains in `WEBSITE-PERFORMANCE-MOBILE-SECURITY-AUDIT.md`; the preceding implementation records remain in `PHASE-1-SECURITY-CHECKPOINT.md` and `PHASE-2-IMAGE-PIPELINE-MIGRATION.md`.
