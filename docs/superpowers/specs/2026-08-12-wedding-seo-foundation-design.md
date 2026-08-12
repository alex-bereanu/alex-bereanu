# Wedding SEO Foundation Design

**Date:** 2026-08-12

## Goal

Establish one unambiguous canonical home for wedding-photography content, make both public domains straightforward for crawlers to discover, and describe the wedding service accurately to search engines without fabricating business details.

## Scope

This change covers:

- host-aware `sitemap.xml` and `robots.txt` responses;
- permanent canonical-domain redirects;
- wedding-page search and social metadata;
- wedding-service JSON-LD;
- focused automated tests and project verification.

It does not expand the visible wedding landing-page content, add analytics, create an Open Graph image, register either domain with search engines, or add unverified address, telephone, price, review, rating, or social-profile data.

## Canonical Domain Model

`NEXT_PUBLIC_WEDDINGS_URL` is the canonical home of the wedding landing page. Its URL is normalized to the domain root with a trailing slash. `NEXT_PUBLIC_SITE_URL` remains canonical for the main website, portfolio category pages, and public gallery pages.

The proxy will enforce the boundary with permanent HTTP 308 redirects while retaining the incoming query string:

- `NEXT_PUBLIC_SITE_URL/weddings` redirects to `NEXT_PUBLIC_WEDDINGS_URL/`.
- `NEXT_PUBLIC_WEDDINGS_URL/weddings` redirects to `NEXT_PUBLIC_WEDDINGS_URL/`.
- Other navigable page paths requested on the wedding hostname redirect to the equivalent path on `NEXT_PUBLIC_SITE_URL`.

The wedding hostname continues to serve its own root page through the existing internal rewrite to `/weddings`. Host-specific metadata endpoints, framework assets, and operational routes remain available rather than being redirected as page duplicates. Private/admin/API responses retain their existing no-index and security controls.

## Sitemap Design

The native Next.js `app/sitemap.ts` metadata convention will produce a host-aware sitemap.

On the main hostname, the sitemap contains only canonical, indexable public URLs:

- `/`;
- `/portfolio`;
- `/portfolio/weddings`;
- `/portfolio/portraits`;
- `/portfolio/automotive`;
- `/portfolio/landscapes`;
- every published, public gallery at `/portfolio/galleries/{slug}`.

Published public gallery entries include their stored update timestamp as `lastModified`. A small service query will select only the slug and update timestamp. It will reuse the same published/public eligibility rules used by the public gallery pages and will return no dynamic entries when the database is not configured.

The main sitemap excludes `/weddings` because it redirects to another canonical domain. It also excludes client links, admin pages, previews, API routes, internal routes, downloads, and media endpoints.

On the wedding hostname, the sitemap contains only `NEXT_PUBLIC_WEDDINGS_URL/`. The wedding sitemap does not advertise main-site or duplicate `/weddings` URLs.

No image sitemap, sitemap splitting, speculative priorities, or change-frequency hints are included in this foundation change.

## Robots Design

The native Next.js `app/robots.ts` metadata convention will produce a host-aware response. Both domains allow crawling of public content and disallow these private or operational path prefixes:

- `/admin/`;
- `/api/`;
- `/g/`.

Each response advertises only the sitemap on its own canonical hostname. Robots rules complement, but do not replace, the existing `X-Robots-Tag` headers on private responses.

## Wedding Metadata

The wedding page will emit:

- a canonical URL of `NEXT_PUBLIC_WEDDINGS_URL/`;
- a search title targeting wedding photography in Bucharest;
- a description naming Bucharest, Romania as the primary market and worldwide destination-wedding coverage;
- matching Open Graph URL, title, description, and website type;
- matching Twitter card metadata;
- an available wedding portfolio image for social previews when one is configured.

Published admin-managed `seoTitle` and `seoDescription` values continue to override the location-aware defaults. The resolved title is emitted as an absolute title so the root layout title template does not append a second brand suffix. The metadata remains generated in the server page through the supported Next.js 16 Metadata API.

The fallback search copy is:

- Title: `Wedding Photographer Bucharest | Alex Bereanu`
- Description: `Documentary and editorial wedding photography in Bucharest, Romania, with destination wedding coverage available worldwide.`

## Structured Data

The wedding page will render one sanitized `application/ld+json` block describing a Schema.org `Service`.

The entity contains:

- service name and `serviceType` of wedding photography;
- canonical wedding URL;
- the same resolved description used by page metadata;
- the configured site brand as a `ProfessionalService` provider;
- Bucharest as a `City` service area;
- Romania as a `Country` service area;
- worldwide destination coverage as a `Place` service area.

The provider links to the configured main site when available and otherwise to the wedding URL. The JSON serialization replaces `<` with its Unicode escape so admin-managed strings cannot break out of the script element. No new schema library is added because the object is small and native JSON serialization is sufficient.

## Code Boundaries

A small shared SEO module will hold pure, testable behavior for hostname normalization, URL construction, redirect decisions, sitemap and robots objects, wedding metadata, and JSON-LD serialization. The Next.js metadata-route files and proxy remain thin adapters around those functions.

The public-gallery service gains one narrow read function for sitemap records. Existing gallery filtering constants are reused so sitemap eligibility cannot drift from public-page eligibility.

No unrelated content, styling, database schema, or admin-editor behavior changes are included.

## Error and Configuration Behavior

Production SEO output depends on valid `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_WEDDINGS_URL` values. Existing environment validation continues to reject malformed URLs. Development without a database still returns the static main-site sitemap entries and no gallery entries.

If the current request hostname does not match the configured wedding hostname, metadata routes default to the main-site variant. This prevents an unknown or preview hostname from being treated as canonical wedding content.

Redirect logic activates only when the relevant configured URL is present. Existing development behavior remains usable when optional public URLs are absent.

## Testing and Verification

Automated tests will be written before production changes and will cover:

- main `/weddings` redirecting permanently to the wedding root;
- wedding `/weddings` redirecting permanently to the wedding root;
- duplicate page paths on the wedding hostname redirecting to the main hostname;
- query-string preservation;
- metadata, sitemap, robots, assets, and operational paths avoiding unintended page redirects;
- the main sitemap containing static public pages and published gallery records but not `/weddings` or private paths;
- the wedding sitemap containing only its root;
- each robots response advertising its own sitemap and blocking private prefixes;
- wedding canonical, title, description, Open Graph, and Twitter metadata;
- structured data containing Bucharest, Romania, worldwide coverage, and no fabricated business properties;
- `<` escaping in the serialized JSON-LD.

After focused tests pass, the change will be verified with lint, TypeScript type checking, and a production build.

## Success Criteria

- Search engines receive exactly one canonical wedding landing URL.
- Duplicate public pages are not served as indexable content on both domains.
- Each hostname advertises a sitemap containing only its own canonical URLs.
- Private and operational routes remain excluded from crawling and sitemap discovery.
- Wedding metadata targets Bucharest while accurately communicating worldwide destination availability.
- Structured data validates as safe JSON-LD and contains only known business facts.
- Tests, lint, type checking, and the production build pass.
