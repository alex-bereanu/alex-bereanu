const passthroughPrefixes = ["/api/", "/admin/", "/g/"];
const passthroughPaths = new Set(["/robots.txt", "/sitemap.xml", "/favicon.ico"]);

export type CanonicalRedirectInput = {
  host: string;
  pathname: string;
  search: string;
  siteUrl?: string;
  weddingsUrl?: string;
};

function rootUrl(value?: string): URL | null {
  if (!value) return null;

  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function normalizedHost(host: string): string {
  return host.split(",")[0]?.trim().toLowerCase() ?? "";
}

function isPassthroughPath(pathname: string): boolean {
  const finalSegment = pathname.split("/").at(-1) ?? "";
  return (
    passthroughPaths.has(pathname) ||
    passthroughPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    finalSegment.includes(".")
  );
}

function redirectUrl(root: URL, pathname: string, search: string): string {
  const target = new URL(pathname, root);
  target.search = search;
  return target.toString();
}

export function isWeddingHost(host: string, weddingsUrl?: string): boolean {
  const weddingsRoot = rootUrl(weddingsUrl);
  return Boolean(weddingsRoot && normalizedHost(host) === weddingsRoot.host.toLowerCase());
}

export function getCanonicalRedirect(input: CanonicalRedirectInput): string | null {
  const siteRoot = rootUrl(input.siteUrl);
  const weddingsRoot = rootUrl(input.weddingsUrl);
  const host = normalizedHost(input.host);

  if (siteRoot && weddingsRoot && host === siteRoot.host.toLowerCase() && input.pathname === "/weddings") {
    return redirectUrl(weddingsRoot, "/", input.search);
  }

  if (!weddingsRoot || host !== weddingsRoot.host.toLowerCase() || input.pathname === "/" || isPassthroughPath(input.pathname)) {
    return null;
  }

  if (input.pathname === "/weddings") {
    return redirectUrl(weddingsRoot, "/", input.search);
  }

  return siteRoot ? redirectUrl(siteRoot, input.pathname, input.search) : null;
}
