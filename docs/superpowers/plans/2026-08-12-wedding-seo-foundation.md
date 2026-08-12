# Wedding SEO Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the main and wedding domains distinct canonical crawl surfaces, permanently redirect duplicate wedding URLs, and publish accurate Bucharest/worldwide wedding metadata and JSON-LD.

**Architecture:** Pure SEO builders in `src/lib/seo.ts` own URL normalization, redirect decisions, sitemap/robots output, metadata, and structured data. Next.js proxy and metadata route files remain thin adapters; the public-gallery service provides the only database-backed sitemap records. Tests exercise the pure behavior with literal expectations before each adapter is implemented.

**Tech Stack:** Next.js 16.2 App Router metadata routes, TypeScript 5, React 19 server components, Node test runner through the installed `tsx` binary, Prisma 7.

## Global Constraints

- `NEXT_PUBLIC_WEDDINGS_URL` is the only canonical wedding landing URL; `NEXT_PUBLIC_SITE_URL` remains canonical for the main site and portfolio.
- Canonical redirects use HTTP 308 and preserve query strings.
- Main sitemap entries are public static routes plus published/public galleries; wedding sitemap contains only its root.
- `/admin/`, `/api/`, and `/g/` remain excluded from crawling and every sitemap.
- Default wedding SEO targets Bucharest, Romania and states destination coverage is available worldwide.
- Admin-managed `seoTitle` and `seoDescription` override fallback copy.
- Do not add address, telephone, price, review, rating, or social-profile claims.
- Use native Next.js metadata APIs and native JSON serialization; add no dependencies.
- Read relevant documentation under `node_modules/next/dist/docs/` before changing Next.js behavior.

---

### Task 1: Canonical Domain Redirect Decisions

**Files:**
- Create: `src/lib/seo.ts`
- Create: `src/lib/seo.test.ts`
- Modify: `src/proxy.ts`

**Interfaces:**
- Consumes: `{ host, pathname, search, siteUrl, weddingsUrl }` strings from `NextRequest` and environment configuration.
- Produces: `getCanonicalRedirect(input): string | null` and `isWeddingHost(host, weddingsUrl): boolean` for proxy and later metadata-route use.

- [ ] **Step 1: Write failing redirect tests**

Create `src/lib/seo.test.ts` with literal expectations that catch the wrong host branch, wrong destination, lost query strings, and accidental asset/operational redirects:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { getCanonicalRedirect } from "./seo";

const config = {
  siteUrl: "https://alex.example",
  weddingsUrl: "https://weddings.example",
};

test("redirects the main wedding path permanently to the canonical wedding root target", () => {
  assert.equal(getCanonicalRedirect({ ...config, host: "alex.example", pathname: "/weddings", search: "?utm_source=google" }), "https://weddings.example/?utm_source=google");
});

test("redirects duplicate wedding-host page paths to their canonical domains", () => {
  assert.equal(getCanonicalRedirect({ ...config, host: "weddings.example", pathname: "/weddings", search: "" }), "https://weddings.example/");
  assert.equal(getCanonicalRedirect({ ...config, host: "weddings.example", pathname: "/portfolio/weddings", search: "?view=all" }), "https://alex.example/portfolio/weddings?view=all");
});

test("does not redirect the wedding root, SEO routes, assets, or operational paths", () => {
  for (const pathname of ["/", "/robots.txt", "/sitemap.xml", "/favicon.ico", "/window.svg", "/api/contact", "/admin/login", "/g/private-token"]) {
    assert.equal(getCanonicalRedirect({ ...config, host: "weddings.example", pathname, search: "" }), null, pathname);
  }
});

test("does not redirect unknown preview hosts", () => {
  assert.equal(getCanonicalRedirect({ ...config, host: "preview.example", pathname: "/weddings", search: "" }), null);
});
```

- [ ] **Step 2: Run the redirect tests and verify RED**

Run:

```powershell
node_modules\.bin\tsx.cmd --test src\lib\seo.test.ts
```

Expected: FAIL because `src/lib/seo.ts` or `getCanonicalRedirect` does not exist.

- [ ] **Step 3: Implement the minimum pure redirect logic**

Create `src/lib/seo.ts` with URL-root normalization, first-host normalization, operational/asset passthrough detection, and this exported contract:

```ts
export type CanonicalRedirectInput = {
  host: string;
  pathname: string;
  search: string;
  siteUrl?: string;
  weddingsUrl?: string;
};

export function isWeddingHost(host: string, weddingsUrl?: string): boolean;
export function getCanonicalRedirect(input: CanonicalRedirectInput): string | null;
```

Implementation rules:

```ts
const passthroughPrefixes = ["/api/", "/admin/", "/g/"];
const passthroughPaths = new Set(["/robots.txt", "/sitemap.xml", "/favicon.ico"]);

// Normalize configured URLs to `/`, compare lowercase URL.host values, and
// consider a final path segment containing `.` to be a static asset.
// Apply input.search to every redirect URL before returning target.toString().
```

- [ ] **Step 4: Run the redirect tests and verify GREEN**

Run:

```powershell
node_modules\.bin\tsx.cmd --test src\lib\seo.test.ts
```

Expected: all four redirect tests PASS with no warnings.

- [ ] **Step 5: Wire the tested decision into the proxy**

Modify `src/proxy.ts` before the existing wedding-root rewrite:

```ts
const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
const requestHost = normalizeHost(forwardedHost ?? request.headers.get("host"));
const canonicalRedirect = getCanonicalRedirect({
  host: requestHost,
  pathname,
  search: request.nextUrl.search,
  siteUrl: env.NEXT_PUBLIC_SITE_URL,
  weddingsUrl: env.NEXT_PUBLIC_WEDDINGS_URL,
});

if (canonicalRedirect) {
  return withSecurityHeaders(NextResponse.redirect(canonicalRedirect, 308));
}
```

Use `isWeddingHost(requestHost, env.NEXT_PUBLIC_WEDDINGS_URL)` for the root rewrite, retaining `WEDDINGS_DOMAIN` as a compatibility fallback only when the public wedding URL is absent.

- [ ] **Step 6: Verify the adapter compiles and commit**

Run:

```powershell
npm.cmd run typecheck
git add src/lib/seo.ts src/lib/seo.test.ts src/proxy.ts
git commit -m "feat: enforce wedding canonical domain"
```

Expected: TypeScript passes and the commit contains only redirect helper, tests, and proxy integration.

---

### Task 2: Host-Aware Sitemap and Robots Routes

**Files:**
- Modify: `src/lib/seo.ts`
- Modify: `src/lib/seo.test.ts`
- Modify: `src/server/services/public-gallery.ts`
- Create: `src/app/sitemap.ts`
- Create: `src/app/robots.ts`

**Interfaces:**
- Consumes: `GallerySitemapRecord[]`, request hostname/origin, and configured public URLs.
- Produces: `buildSitemap(input): MetadataRoute.Sitemap`, `buildRobots(input): MetadataRoute.Robots`, and `getPublicGallerySitemapRecords(): Promise<GallerySitemapRecord[]>`.

- [ ] **Step 1: Add failing sitemap and robots tests**

Replace the existing SEO import with the expanded import, then append the tests to `src/lib/seo.test.ts`:

```ts
import { buildRobots, buildSitemap, getCanonicalRedirect } from "./seo";

const galleries = [
  { slug: "ana-andrei", updatedAt: new Date("2026-08-01T12:00:00.000Z") },
];

test("builds the main sitemap from canonical static pages and public gallery records", () => {
  const result = buildSitemap({ ...config, host: "alex.example", requestOrigin: "https://alex.example", galleries });
  assert.deepEqual(result.map(({ url }) => url), [
    "https://alex.example/",
    "https://alex.example/portfolio",
    "https://alex.example/portfolio/weddings",
    "https://alex.example/portfolio/portraits",
    "https://alex.example/portfolio/automotive",
    "https://alex.example/portfolio/landscapes",
    "https://alex.example/portfolio/galleries/ana-andrei",
  ]);
  assert.equal((result.at(-1)?.lastModified as Date).toISOString(), "2026-08-01T12:00:00.000Z");
  assert.equal(result.some(({ url }) => url.includes("/weddings") && !url.includes("/portfolio/weddings")), false);
});

test("builds a one-entry wedding sitemap", () => {
  assert.deepEqual(buildSitemap({ ...config, host: "weddings.example", requestOrigin: "https://weddings.example", galleries }), [{ url: "https://weddings.example/" }]);
});

test("builds host-specific robots output with private prefixes blocked", () => {
  assert.deepEqual(buildRobots({ ...config, host: "alex.example", requestOrigin: "https://alex.example" }), {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/", "/g/"] },
    sitemap: "https://alex.example/sitemap.xml",
  });
  assert.equal(buildRobots({ ...config, host: "weddings.example", requestOrigin: "https://weddings.example" }).sitemap, "https://weddings.example/sitemap.xml");
});
```

- [ ] **Step 2: Run the expanded tests and verify RED**

Run:

```powershell
node_modules\.bin\tsx.cmd --test src\lib\seo.test.ts
```

Expected: redirect tests PASS; sitemap/robots tests FAIL because the new exports do not exist.

- [ ] **Step 3: Implement sitemap and robots builders**

Add the following public types and functions to `src/lib/seo.ts` using `MetadataRoute` from `next`:

```ts
export type GallerySitemapRecord = { slug: string; updatedAt: Date };
export type SeoRouteInput = {
  host: string;
  requestOrigin: string;
  siteUrl?: string;
  weddingsUrl?: string;
};

export function buildSitemap(input: SeoRouteInput & { galleries: GallerySitemapRecord[] }): MetadataRoute.Sitemap;
export function buildRobots(input: SeoRouteInput): MetadataRoute.Robots;
```

Use exactly these main paths in order:

```ts
const mainSitemapPaths = [
  "/",
  "/portfolio",
  "/portfolio/weddings",
  "/portfolio/portraits",
  "/portfolio/automotive",
  "/portfolio/landscapes",
] as const;
```

Choose the wedding root only when `isWeddingHost` is true; otherwise use the configured main root, falling back to `requestOrigin`. Encode gallery slugs with `encodeURIComponent`.

- [ ] **Step 4: Run the expanded tests and verify GREEN**

Run:

```powershell
node_modules\.bin\tsx.cmd --test src\lib\seo.test.ts
```

Expected: all redirect, sitemap, and robots tests PASS.

- [ ] **Step 5: Add the narrow public-gallery sitemap query**

Modify `src/server/services/public-gallery.ts` to export the tested record shape and reuse `publishedPublicGalleryWhere`:

```ts
export async function getPublicGallerySitemapRecords(): Promise<GallerySitemapRecord[]> {
  if (!env.DATABASE_URL) return [];
  return prisma.gallery.findMany({
    where: publishedPublicGalleryWhere,
    orderBy: [{ updatedAt: "desc" }],
    select: { slug: true, updatedAt: true },
  });
}
```

- [ ] **Step 6: Add thin Next.js metadata-route adapters**

Create `src/app/sitemap.ts` and `src/app/robots.ts`. Each awaits `headers()`, prefers the first `x-forwarded-host`, uses `x-forwarded-proto` with an `https` fallback, and passes a literal `requestOrigin` into the pure builder. `sitemap.ts` calls `getPublicGallerySitemapRecords()` only for the main-host variant; passing records to a wedding sitemap is harmless but avoid the database read.

The sitemap adapter returns:

```ts
return buildSitemap({
  host,
  requestOrigin,
  siteUrl: env.NEXT_PUBLIC_SITE_URL,
  weddingsUrl: env.NEXT_PUBLIC_WEDDINGS_URL,
  galleries,
});
```

The robots adapter returns the equivalent `buildRobots` call without galleries.

- [ ] **Step 7: Verify metadata routes and commit**

Run:

```powershell
node_modules\.bin\tsx.cmd --test src\lib\seo.test.ts
npm.cmd run typecheck
git add src/lib/seo.ts src/lib/seo.test.ts src/server/services/public-gallery.ts src/app/sitemap.ts src/app/robots.ts
git commit -m "feat: add host-aware SEO discovery routes"
```

Expected: tests and TypeScript pass; the commit adds no dependency and no private URL to sitemap output.

---

### Task 3: Wedding Metadata, Direct Canonical Links, and JSON-LD

**Files:**
- Modify: `src/lib/seo.ts`
- Modify: `src/lib/seo.test.ts`
- Modify: `src/app/weddings/page.tsx`

**Interfaces:**
- Consumes: published wedding SEO fields, configured brand/site URLs, and optional wedding portfolio image.
- Produces: `resolveWeddingSeo(input): ResolvedWeddingSeo`, `buildWeddingMetadata(seo): Metadata`, an inferred typed object from `buildWeddingServiceJsonLd(input)`, and `serializeJsonLd(value): string`.

- [ ] **Step 1: Add failing metadata and JSON-LD tests**

Replace the SEO import with this complete import, then append the tests to `src/lib/seo.test.ts`:

```ts
import {
  buildRobots,
  buildSitemap,
  buildWeddingMetadata,
  buildWeddingServiceJsonLd,
  getCanonicalRedirect,
  resolveWeddingSeo,
  serializeJsonLd,
} from "./seo";

test("resolves canonical Bucharest and worldwide wedding metadata with an optional image", () => {
  const seo = resolveWeddingSeo({
    weddingsUrl: "https://weddings.example/presentation",
    seoTitle: "",
    seoDescription: "",
    imageUrl: "https://cdn.example/wedding.jpg",
    imageAlt: "A couple leaving their Bucharest ceremony",
  });
  const metadata = buildWeddingMetadata(seo);

  assert.equal(seo.canonical, "https://weddings.example/");
  assert.equal(seo.title, "Wedding Photographer Bucharest | Alex Bereanu");
  assert.match(seo.description, /Bucharest, Romania/);
  assert.match(seo.description, /worldwide/);
  assert.deepEqual(metadata.alternates, { canonical: "https://weddings.example/" });
  assert.equal(metadata.openGraph?.url, "https://weddings.example/");
  assert.equal(metadata.twitter?.card, "summary_large_image");
});

test("honors managed SEO overrides", () => {
  const seo = resolveWeddingSeo({ weddingsUrl: "https://weddings.example", seoTitle: "Custom title", seoDescription: "Custom description" });
  assert.equal(seo.title, "Custom title");
  assert.equal(seo.description, "Custom description");
});

test("describes only known wedding service facts and safely serializes JSON-LD", () => {
  const seo = resolveWeddingSeo({ weddingsUrl: "https://weddings.example", seoDescription: "Editorial <wedding> photography" });
  const value = buildWeddingServiceJsonLd({ seo, brandName: "Alex Bereanu Photography", siteUrl: "https://alex.example" });
  const json = serializeJsonLd(value);

  assert.equal(value["@type"], "Service");
  assert.deepEqual(value.areaServed.map((area: { name: string }) => area.name), ["Bucharest", "Romania", "Worldwide"]);
  assert.equal("address" in value.provider, false);
  assert.equal("telephone" in value.provider, false);
  assert.equal("aggregateRating" in value.provider, false);
  assert.equal("offers" in value, false);
  assert.equal("sameAs" in value.provider, false);
  assert.equal(json.includes("<"), false);
  assert.match(json, /\\u003cwedding>/);
});
```

- [ ] **Step 2: Run the metadata tests and verify RED**

Run:

```powershell
node_modules\.bin\tsx.cmd --test src\lib\seo.test.ts
```

Expected: existing tests PASS; metadata/JSON-LD tests FAIL because their exports do not exist.

- [ ] **Step 3: Implement the metadata and structured-data builders**

Add these constants and interfaces to `src/lib/seo.ts`:

```ts
const DEFAULT_WEDDING_TITLE = "Wedding Photographer Bucharest | Alex Bereanu";
const DEFAULT_WEDDING_DESCRIPTION = "Documentary and editorial wedding photography in Bucharest, Romania, with destination wedding coverage available worldwide.";

export type ResolvedWeddingSeo = {
  title: string;
  description: string;
  canonical: string;
  imageUrl?: string;
  imageAlt?: string;
};
```

`resolveWeddingSeo` trims overrides and normalizes `weddingsUrl` to its root, falling back to `/weddings`. `buildWeddingMetadata` returns an absolute title plus description, canonical alternate, matching Open Graph fields, and a `summary_large_image` Twitter card only when an image is present (`summary` otherwise). `buildWeddingServiceJsonLd` returns:

```ts
{
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Wedding photography",
  serviceType: "Wedding photography",
  url: seo.canonical,
  description: seo.description,
  provider: {
    "@type": "ProfessionalService",
    name: brandName,
    url: normalizedSiteUrl ?? seo.canonical,
  },
  areaServed: [
    { "@type": "City", name: "Bucharest" },
    { "@type": "Country", name: "Romania" },
    { "@type": "Place", name: "Worldwide" },
  ],
}
```

`serializeJsonLd` is exactly `JSON.stringify(value).replace(/</g, "\\u003c")`.

- [ ] **Step 4: Run all SEO unit tests and verify GREEN**

Run:

```powershell
node_modules\.bin\tsx.cmd --test src\lib\seo.test.ts
```

Expected: every SEO test PASS.

- [ ] **Step 5: Integrate metadata and JSON-LD into the wedding server page**

Modify `src/app/weddings/page.tsx` so both `generateMetadata` and the page resolve:

```ts
const [content, weddingPortfolio] = await Promise.all([
  getPublishedSiteContentDocument("weddings.landing"),
  getSiteContent("portfolio.weddings"),
]);
```

Build SEO with `content.values.seoTitle`, `content.values.seoDescription`, `env.NEXT_PUBLIC_WEDDINGS_URL`, and `weddingPortfolio.imageMediumSrc ?? weddingPortfolio.imageSrc`. Render a native sanitized JSON-LD `<script type="application/ld+json">` as the first child of the page root.

Build main-site links directly with `new URL(path, env.NEXT_PUBLIC_SITE_URL).toString()` when configured. Use them for the Home link, portfolio category links, wedding portfolio CTA, and footer wedding link so the wedding page does not intentionally link through duplicate wedding-host paths.

- [ ] **Step 6: Verify the wedding integration and commit**

Run:

```powershell
node_modules\.bin\tsx.cmd --test src\lib\seo.test.ts
npm.cmd run typecheck
git add src/lib/seo.ts src/lib/seo.test.ts src/app/weddings/page.tsx
git commit -m "feat: publish wedding SEO metadata"
```

Expected: tests and TypeScript pass; the page contains safe JSON-LD and direct canonical links.

---

### Task 4: Full Verification

**Files:**
- Modify only files from Tasks 1-3 if a verification command exposes a defect.

**Interfaces:**
- Consumes: the complete SEO foundation implementation.
- Produces: repository-wide evidence that tests, lint, types, and the Next.js production build pass.

- [ ] **Step 1: Run all repository unit tests**

Run:

```powershell
node_modules\.bin\tsx.cmd --test src\lib\seo.test.ts src\server\auth\cookies.test.ts src\server\security\request-protection.test.ts
```

Expected: SEO, cookie, and request-protection tests PASS.

- [ ] **Step 2: Run static verification**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
```

Expected: both commands exit 0 without warnings introduced by the change.

- [ ] **Step 3: Run the production build**

Run:

```powershell
npm.cmd run build
```

Expected: Next.js 16.2 production build exits 0 and emits `/robots.txt` and `/sitemap.xml` routes.

- [ ] **Step 4: Inspect the final diff and commit verification fixes only if needed**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only intentional files changed. If verification required a code fix, rerun the command that exposed it and commit the fix as `fix: complete wedding SEO verification`.
