import Link from "next/link";

export type SiteHeaderLink = {
  href: string;
  label: string;
};

type SiteHeaderProps = {
  links: readonly SiteHeaderLink[];
  className?: string;
  brandName?: string;
};

function HeaderLink({ href, label }: SiteHeaderLink) {
  const className = "header-link";

  if (href.startsWith("#")) {
    return (
      <a className={className} href={href}>
        {label}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {label}
    </Link>
  );
}

export function SiteHeader({ links, className = "", brandName = "Alex Bereanu" }: SiteHeaderProps) {
  return (
    <header className={`site-header ${className}`.trim()}>
      <div className="site-header-inner">
        <Link aria-label={`${brandName} home`} className="header-brand" href="/">
          {brandName}
        </Link>

        <nav aria-label="Primary navigation" className="header-nav">
          {links.map((link) => (
            <HeaderLink key={`${link.href}-${link.label}`} {...link} />
          ))}
        </nav>
      </div>
    </header>
  );
}
