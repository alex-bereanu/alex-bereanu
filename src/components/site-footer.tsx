import Link from "next/link";

import { getSiteContent } from "@/server/services/site-content";

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
  const instagramContent = await getSiteContent("social.instagram");
  const instagramHref = getInstagramHref(instagramContent.body);

  return (
    <footer className="site-footer p-6">
      <div className="site-footer-layout">
        <div className="site-footer-brand">
          <p className="editorial-heading text-2xl">Alex Bereanu</p>
          <p className="text-sm text-neutral-600">The elegance of being there</p>
        </div>

        <div className="site-footer-social">
          {instagramHref ? (
            <a
              aria-label="Open Instagram"
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
                {link.label}
              </Link>
            ) : (
              <a className="header-link" href={link.href} key={`${link.href}-${link.label}`}>
                {link.label}
              </a>
            ),
          )}
        </div>
      </div>
    </footer>
  );
}
