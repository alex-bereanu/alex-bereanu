import Link from "next/link";

import { getPublishedSiteContentDocuments } from "@/server/services/site-content";

type FooterLink = {
  href: string;
  label: string;
};

type SiteFooterProps = {
  links: FooterLink[];
};

function getInstagramHref(value: string): string | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const normalizedValue = /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;

  try {
    const url = new URL(normalizedValue);
    return url.toString();
  } catch {
    return null;
  }
}

function InstagramIcon() {
  return (
    <svg aria-hidden="true" className="h-10 w-10" fill="none" viewBox="0 0 24 24">
      <rect height="16" rx="5" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="4" />
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.7" cy="7.3" fill="currentColor" r="1" />
    </svg>
  );
}

export async function SiteFooter({ links }: SiteFooterProps) {
  const [instagramContent, brandContent, footerContent, navigationContent] = await getPublishedSiteContentDocuments(["social.instagram", "global.brand", "global.footer", "global.navigation"]);
  const instagramHref = getInstagramHref(instagramContent?.values.body ?? "");
  const brandName = footerContent?.values.title || brandContent?.values.title || "Alex Bereanu";
  const tagline = footerContent?.values.subtitle || brandContent?.values.subtitle || "The elegance of being there";
  const navigation = navigationContent?.values ?? {};
  const labelForHref = (link: FooterLink) => {
    if (link.href === "/") return navigation.homeLabel || link.label;
    if (link.href === "/portfolio") return navigation.portfolioLabel || link.label;
    if (link.href.includes("#contact")) return navigation.connectLabel || link.label;
    if (link.href.includes("#about")) return navigation.aboutLabel || link.label;
    if (link.href.includes("#galleries")) return navigation.galleriesLabel || link.label;
    return link.label;
  };

  return (
    <footer className="site-footer p-6">
      <div className="site-footer-layout">
        <div className="site-footer-brand">
          <p className="editorial-heading text-2xl">{brandName}</p>
          <p className="text-sm text-neutral-600">{tagline}</p>
          {footerContent?.values.body ? <p className="max-w-sm whitespace-pre-wrap text-xs text-neutral-500">{footerContent.values.body}</p> : null}
        </div>

        <div className="site-footer-social">
          {instagramHref ? (
            <a
              aria-label={instagramContent?.values.title || "Open Instagram"}
              className="instagram-button"
              href={instagramHref}
              rel="noreferrer"
              target="_blank"
            >
              <InstagramIcon />
            </a>
          ) : (
            <span aria-label="Instagram URL not configured" className="instagram-button instagram-button-disabled">
              <InstagramIcon />
            </span>
          )}
        </div>

        <div className="site-footer-links">
          {links.map((link) =>
            link.href.startsWith("/") ? (
              <Link className="header-link" href={link.href} key={`${link.href}-${link.label}`}>
                {labelForHref(link)}
              </Link>
            ) : (
              <a className="header-link" href={link.href} key={`${link.href}-${link.label}`}>
                {labelForHref(link)}
              </a>
            ),
          )}
        </div>
      </div>
    </footer>
  );
}
