import assert from "node:assert/strict";
import test from "node:test";

import { verifySameOriginRequest } from "./request-protection";

const actionUrl = "http://0.0.0.0:3000/admin/actions/site-content/update";

test("accepts the browser origin when Next uses an internal request URL", () => {
  const request = new Request(actionUrl, {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
    },
  });

  assert.equal(verifySameOriginRequest(request), true);
});

test("accepts the first forwarded host from a trusted reverse proxy", () => {
  const request = new Request(actionUrl, {
    method: "POST",
    headers: {
      host: "internal:3000",
      origin: "https://admin.example.com",
      "x-forwarded-host": "admin.example.com, internal:3000",
    },
  });

  assert.equal(verifySameOriginRequest(request), true);
});

test("uses the referer when Origin is unavailable", () => {
  const request = new Request(actionUrl, {
    method: "POST",
    headers: {
      host: "localhost:3000",
      referer: "http://localhost:3000/admin/pages/home.about",
    },
  });

  assert.equal(verifySameOriginRequest(request), true);
});

test("accepts browser-confirmed same-origin forms when proxy host metadata disagrees", () => {
  const request = new Request(actionUrl, {
    method: "POST",
    headers: {
      host: "[::1]:3000",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      "x-forwarded-host": "[::1]:3000",
    },
  });

  assert.equal(verifySameOriginRequest(request), true);
});

test("rejects browser-confirmed cross-site forms even when Host appears to match", () => {
  const request = new Request(actionUrl, {
    method: "POST",
    headers: {
      host: "public.test",
      origin: "http://public.test",
      "sec-fetch-site": "cross-site",
    },
  });

  assert.equal(verifySameOriginRequest(request), false);
});

test("rejects cross-origin and lookalike hosts", () => {
  for (const origin of ["https://evil.example", "http://localhost:3000.evil.example"]) {
    const request = new Request(actionUrl, {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin,
      },
    });

    assert.equal(verifySameOriginRequest(request), false);
  }
});

test("rejects malformed origins and forwarded-host mismatches", () => {
  const malformedOrigins = ["null", "file:///tmp/admin", "data:text/plain,admin"].map((origin) => new Request(actionUrl, {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin,
    },
  }));
  const forwardedHostMismatch = new Request(actionUrl, {
    method: "POST",
    headers: {
      host: "public.test",
      origin: "http://public.test",
      "x-forwarded-host": "admin.example.com",
    },
  });
  const malformedForwardedHost = new Request(actionUrl, {
    method: "POST",
    headers: {
      host: "public.test",
      origin: "http://public.test",
      "x-forwarded-host": "not a host/",
    },
  });

  for (const request of malformedOrigins) {
    assert.equal(verifySameOriginRequest(request), false);
  }
  assert.equal(verifySameOriginRequest(forwardedHostMismatch), false);
  assert.equal(verifySameOriginRequest(malformedForwardedHost), false);
});
