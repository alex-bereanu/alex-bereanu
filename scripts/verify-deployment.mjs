const baseUrlValue = process.argv[2] ?? process.env.DEPLOYMENT_BASE_URL;
if (!baseUrlValue) throw new Error("Provide an HTTPS deployment URL as the first argument or DEPLOYMENT_BASE_URL.");
const baseUrl = new URL(baseUrlValue);
if (baseUrl.protocol !== "https:") throw new Error("Deployment verification requires HTTPS.");

async function inspect(pathname) {
  const response = await fetch(new URL(pathname, baseUrl), { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  return { response, headers: response.headers };
}

const publicPage = await inspect("/");
if (publicPage.response.status >= 500) throw new Error("Public homepage is unavailable.");
const csp = publicPage.headers.get("content-security-policy") ?? "";
for (const directive of ["object-src 'none'", "frame-ancestors 'none'", "script-src-attr 'none'", "upgrade-insecure-requests"]) {
  if (!csp.includes(directive)) throw new Error(`Production CSP is missing ${directive}.`);
}
if (csp.includes("'unsafe-eval'") || /(?:^|\s)https:(?:\s|;|$)/.test(csp)) {
  throw new Error("Production CSP contains unsafe-eval or a broad HTTPS source.");
}

const expectedHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "origin-agent-cluster": "?1",
};
for (const [name, expected] of Object.entries(expectedHeaders)) {
  if (publicPage.headers.get(name) !== expected) throw new Error(`${name} is missing or incorrect.`);
}

const privatePage = await inspect("/admin/login");
if (!privatePage.headers.get("cache-control")?.includes("no-store")) throw new Error("Admin responses must be no-store.");
if (!privatePage.headers.get("x-robots-tag")?.includes("noindex")) throw new Error("Admin responses must be noindex.");

const health = await inspect("/api/health");
if (health.response.status !== 200) throw new Error("Public liveness check failed.");

console.log("Deployment verification passed (HTTPS, CSP, security/private headers, and liveness)." );
