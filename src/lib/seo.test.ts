import assert from "node:assert/strict";
import test from "node:test";

import { getCanonicalRedirect } from "./seo";

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
