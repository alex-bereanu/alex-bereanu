# Phase 1 Implementation and Security Verification Checkpoint

> **Subsequent approval (31 July 2026):** The user approved continuing the image-pipeline migration. Its local implementation and remaining live deployment gates are documented in `PHASE-2-IMAGE-PIPELINE-MIGRATION.md`. This file preserves the original Phase 1 checkpoint decision and evidence.

**Project:** Alex Bereanu Photography  
**Checkpoint date:** 2026-07-31  
**Decision status:** **HOLD — do not begin private-photo or image-pipeline migration yet**

## User prompts

> look at the the current website implementation and create a plan on how we can continue to develop it into a better version. Focus on improving image loading and overall performance of the website. UI looks good for now, but also take into consideration mobile functionality and performance. Security must also be key, as it will hold valuable personal photos. Before starting to implement the plan, let me review it and we can decide on the best approach. Consider all the relevant skills that you might need in developing the plan

> output all audit as a markdown file and make sure to include my prompt

> sounds good, let's implement Phase 1, including the security verification checkpoint before beginning the image pipeline migration

## Executive result

Phase 1 is implemented in the local worktree. The application now has a fail-closed private-gallery boundary, centralized authorization, hashed share capabilities, revocable database sessions, separate secrets, private response controls, and a retryable storage-deletion outbox.

No production database migration, R2 bucket change, private-object move, share-link cutover, or image-pipeline migration was performed. That external work remains deliberately blocked at this checkpoint.

The local code gate passes. The production dependency audit still reports two linked high-severity entries caused by Next.js 16.2.12 bundling Sharp 0.34.5. No supported Next release currently resolves that nested dependency. As a compensating control, the Next image optimizer is disabled globally, private media never uses it, and application-owned image processing uses Sharp 0.35.3. This residual risk requires explicit acceptance or an upstream Next release before the migration gate is approved.

## Implemented Phase 1 controls

### Private storage and media delivery

- Public and private R2 bucket configuration is separated.
- Private originals, previews, and ZIP archives are addressed only through the private storage area.
- Private previews are streamed through an authenticated, same-origin route.
- Private pages never construct a public R2 URL and never fall back to an original when a derivative is missing.
- Private images bypass `/_next/image`; the site-wide optimizer is also disabled while Next's nested Sharp advisory remains open.
- New upload keys include their storage area and gallery ID, preventing public/private or cross-gallery finalization mismatches.
- Gallery visibility cannot change while stored content exists; a deliberate storage migration is required.

### Gallery authorization and sharing

- One server-only data-access layer revalidates the gallery, share, expiry, grant version, and visibility for page, preview, and download access.
- Share capabilities contain 256 bits of randomness and only their SHA-256 hashes are stored.
- Existing plaintext/legacy share links are deactivated by the migration.
- New links default to a 30-day expiry, support download quotas, and require at least 12 characters when a password is used.
- Passwords are never included in link email; they must be delivered through a separate channel.
- Revocation increments the grant version. Because every private media and download request revalidates database state, revocation and gallery deactivation take effect immediately even if a cookie has not expired.
- Private routes use `no-store`, `noindex`, `nofollow`, `noarchive`, `nosnippet`, `Vary: Cookie`, and `Referrer-Policy: no-referrer`.

### Admin authentication and secrets

- Admin sessions are opaque 256-bit tokens stored only as SHA-256 hashes in the database.
- Sessions expire, can be revoked on logout, and revalidate the current password account or Google email allowlist on every protected request.
- Production defaults to Google-only authentication. Password authentication must be deliberately enabled.
- OAuth state, gallery grants, and CSRF tokens use separate secrets.
- OAuth verification constrains issuer, audience, nonce, and algorithm.
- Password setup requires a separate one-time setup token, a 12-character password, rate limiting, Turnstile when configured, and a database lock. An existing admin permanently closes first-user setup.
- Google-account MFA must be enforced operationally in the identity provider; the application cannot prove Google MFA enrollment from a standard ID token.

### Deletion and retention safety

- Asset, gallery, archive, and replaced site-content deletions first write an outbox record in the same database transaction as metadata removal.
- Storage deletion is idempotent and retryable.
- Failed storage cleanups remain visible in the admin panel and can be retried.
- Prior archives and replaced site-content variants are included, closing previously untracked orphan paths.

### Dependency and framework baseline

- Next.js and its ESLint configuration are updated to 16.2.12.
- Prisma is migrated to 7.9.1 with the PostgreSQL driver adapter.
- Application Sharp is updated to 0.35.3.
- AWS SDK and Resend dependencies are updated.
- PostCSS is overridden to the patched 8.5.25 release.
- Image remote patterns are exact-origin patterns with redirects disabled and a response-size ceiling.

## Verification results

| Check | Result | Evidence |
| --- | --- | --- |
| ESLint | Pass | `npm run lint` |
| TypeScript | Pass | `npm run typecheck` |
| Prisma schema | Pass | `node scripts/prisma-env-runner.mjs validate` |
| Phase 1 static security assertions | Pass | `npm run security:verify` |
| Production build | Pass | `npm run build` on Next.js 16.2.12 |
| Production dependency audit | Conditional hold | `npm audit --omit=dev` reports only Next and its nested Sharp 0.34.5 advisory chain |
| Database migration applied | Not performed | Production mutation intentionally withheld |
| Private R2 access test | Not performed | Bucket and production policy changes intentionally withheld |
| Existing private-photo move | Not performed | Blocked by this checkpoint |
| Image pipeline migration/backfill | Not performed | Blocked by this checkpoint |

The repeatable security command verifies the private route, authorization DAL, secret separation, hashed capability creation, database sessions, storage split, legacy-link revocation migration, optimizer shutdown, and deletion outbox wiring. It is a static regression gate, not a substitute for deployment-level integration or penetration testing.

## Residual findings and checkpoint decisions

### 1. Upstream Next/Sharp advisory — decision required

`npm audit --omit=dev` reports Next.js because Next 16.2.12 installs Sharp 0.34.5 internally. The patched application dependency is Sharp 0.35.3, but forcing that version into Next would cross Next's declared `^0.34.5` compatibility range.

Current compensating controls:

- `images.unoptimized` is always `true`.
- Private images use authenticated same-origin media routes and explicitly bypass the optimizer.
- The application processing path resolves the direct patched Sharp 0.35.3 package.

Recommended decision: keep the migration gate closed, retain the compensating controls, and adopt the first supported Next release that bundles Sharp 0.35 or later. An unsupported Sharp override should only be considered in an isolated branch with image-format and production-load tests.

### 2. External private-bucket proof — required

Before moving any personal photo, create a private R2 bucket with no `r2.dev` or public custom domain. Use a synthetic test object to prove:

- the object returns `403` or `404` from every unauthenticated R2/public hostname;
- the private application route returns `404` without a valid current grant;
- valid access works only after authorization;
- revocation, expiry, gallery deactivation, and grant-version rotation deny page, preview, original, and ZIP access;
- private HTML/RSC contains no public R2 URL, raw object key, or private `/_next/image` URL;
- redirected downloads use a short-lived private-bucket signature and do not receive a capability URL in the `Referer` header.

### 3. Database cutover and legacy links — required

The SQL migration is transactional and intentionally deactivates every existing share link whose capability was stored in recoverable form. The repository did not previously contain a baseline migration history, so production must not run `prisma migrate deploy` blindly against a schema created with `db push`.

Required cutover procedure:

1. Take a verified database backup and inventory active legacy links.
2. Rehearse the migration against a restored staging copy.
3. Baseline the existing schema in Prisma migration history or execute the reviewed SQL through the approved database change process, then record it as applied.
4. Deploy the compatible application and verify database-backed admin sessions.
5. Recreate client links and distribute replacements; old links must remain denied.

### 4. Operational controls — required

- Generate independent random values of at least 32 characters for `OAUTH_STATE_SECRET`, `GALLERY_ACCESS_SECRET`, and `CSRF_SECRET`.
- Configure Google OAuth with an allowlist and enforce MFA on every allowed Google account.
- Keep production `ADMIN_AUTH_MODE=google` unless password login has an explicitly approved recovery purpose.
- Remove `ADMIN_SETUP_TOKEN` immediately after first-user provisioning.
- Restrict R2 credentials to only the required public and private buckets and operations.
- Configure private-bucket CORS only for the real admin origin and required signed-upload headers/methods.
- Define R2 lifecycle, backup retention, incident response, secret rotation, and privacy-deletion evidence procedures.

## Recommended next approval

Approve a staging-only security cutover next:

1. Apply the schema migration to a restored staging database.
2. Create a non-public staging bucket and configure the new secrets.
3. Upload one synthetic gallery through the current flow.
4. Run the external authorization/revocation/object-origin checks above.
5. Re-run lint, type-check, build, `security:verify`, and the production audit.

Only after those checks pass—and the residual Next/Sharp decision is explicitly accepted—should existing private photos be copied into private storage. The Phase 2 upload-session, durable processing queue, responsive-variant backfill, and broader performance work remain out of scope and unstarted.

## Files to review first

- `prisma/schema.prisma`
- `prisma/migrations/20260731090000_phase1_security/migration.sql`
- `src/server/services/gallery-access.ts`
- `src/server/auth/gallery-access.ts`
- `src/server/auth/admin-session.ts`
- `src/server/services/storage.ts`
- `src/server/services/storage-deletions.ts`
- `src/app/api/gallery-media/assets/[assetId]/[variant]/route.ts`
- `proxy.ts`
- `next.config.ts`
- `scripts/verify-phase1-security.mjs`

The original implementation audit remains in `WEBSITE-PERFORMANCE-MOBILE-SECURITY-AUDIT.md`.
