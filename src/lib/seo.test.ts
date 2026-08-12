import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRobots,
  buildSitemap,
  buildWeddingMetadata,
  buildWeddingServiceJsonLd,
  getCanonicalRedirect,
  resolveWeddingSeo,
  serializeJsonLd,
} from "./seo";

const config = {
  siteUrl: "https://alex.example",
  weddingsUrl: "https://weddings.example",
};

test("redirects the main wedding path permanently to the canonical wedding root target", () => {
  assert.equal(
    getCanonicalRedirect({
      ...config,
      host: "alex.example",
      pathname: "/weddings",
      search: "?utm_source=google",
    }),
    "https://weddings.example/?utm_source=google",
  );
});

test("redirects duplicate wedding-host page paths to their canonical domains", () => {
  assert.equal(
    getCanonicalRedirect({
      ...config,
      host: "weddings.example",
      pathname: "/weddings",
      search: "",
    }),
    "https://weddings.example/",
  );
  assert.equal(
    getCanonicalRedirect({
      ...config,
      host: "weddings.example",
      pathname: "/portfolio/weddings",
      search: "?view=all",
    }),
    "https://alex.example/portfolio/weddings?view=all",
  );
});

test("does not redirect the wedding root, SEO routes, assets, or operational paths", () => {
  for (const pathname of [
    "/",
    "/robots.txt",
    "/sitemap.xml",
    "/favicon.ico",
    "/window.svg",
    "/api/contact",
    "/admin/login",
    "/g/private-token",
  ]) {
    assert.equal(
      getCanonicalRedirect({
        ...config,
        host: "weddings.example",
        pathname,
        search: "",
      }),
      null,
      pathname,
    );
  }
});

test("does not redirect unknown preview hosts", () => {
  assert.equal(
    getCanonicalRedirect({
      ...config,
      host: "preview.example",
      pathname: "/weddings",
      search: "",
    }),
    null,
  );
});

const galleries = [
  { slug: "ana-andrei", updatedAt: new Date("2026-08-01T12:00:00.000Z") },
];

test("builds the main sitemap from canonical static pages and public gallery records", () => {
  const result = buildSitemap({
    ...config,
    host: "alex.example",
    requestOrigin: "https://alex.example",
    galleries,
  });

  assert.deepEqual(
    result.map(({ url }) => url),
    [
      "https://alex.example/",
      "https://alex.example/portfolio",
      "https://alex.example/portfolio/weddings",
      "https://alex.example/portfolio/portraits",
      "https://alex.example/portfolio/automotive",
      "https://alex.example/portfolio/landscapes",
      "https://alex.example/portfolio/galleries/ana-andrei",
    ],
  );
  assert.equal(
    (result.at(-1)?.lastModified as Date).toISOString(),
    "2026-08-01T12:00:00.000Z",
  );
  assert.equal(
    result.some(
      ({ url }) =>
        url.includes("/weddings") && !url.includes("/portfolio/weddings"),
    ),
    false,
  );
});

test("builds a one-entry wedding sitemap", () => {
  assert.deepEqual(
    buildSitemap({
      ...config,
      host: "weddings.example",
      requestOrigin: "https://weddings.example",
      galleries,
    }),
    [{ url: "https://weddings.example/" }],
  );
});

test("builds host-specific robots output with private prefixes blocked", () => {
  assert.deepEqual(
    buildRobots({
      ...config,
      host: "alex.example",
      requestOrigin: "https://alex.example",
    }),
    {
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/g/"],
      },
      sitemap: "https://alex.example/sitemap.xml",
    },
  );
  assert.equal(
    buildRobots({
      ...config,
      host: "weddings.example",
      requestOrigin: "https://weddings.example",
    }).sitemap,
    "https://weddings.example/sitemap.xml",
  );
});

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
  assert.deepEqual(metadata.alternates, {
    canonical: "https://weddings.example/",
  });
  assert.equal(metadata.openGraph?.url, "https://weddings.example/");
  assert.ok(metadata.twitter && "card" in metadata.twitter);
  assert.equal(metadata.twitter.card, "summary_large_image");
});

test("honors managed SEO overrides", () => {
  const seo = resolveWeddingSeo({
    weddingsUrl: "https://weddings.example",
    seoTitle: "Custom title",
    seoDescription: "Custom description",
  });
  assert.equal(seo.title, "Custom title");
  assert.equal(seo.description, "Custom description");
});

test("describes only known wedding service facts and safely serializes JSON-LD", () => {
  const seo = resolveWeddingSeo({
    weddingsUrl: "https://weddings.example",
    seoDescription: "Editorial <wedding> photography",
  });
  const value = buildWeddingServiceJsonLd({
    seo,
    brandName: "Alex Bereanu Photography",
    siteUrl: "https://alex.example",
  });
  const json = serializeJsonLd(value);

  assert.equal(value["@type"], "Service");
  assert.deepEqual(
    value.areaServed.map((area: { name: string }) => area.name),
    ["Bucharest", "Romania", "Worldwide"],
  );
  assert.equal("address" in value.provider, false);
  assert.equal("telephone" in value.provider, false);
  assert.equal("aggregateRating" in value.provider, false);
  assert.equal("offers" in value, false);
  assert.equal("sameAs" in value.provider, false);
  assert.equal(json.includes("<"), false);
  assert.match(json, /\\u003cwedding>/);
});
