"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

export type SiteHeaderLink = {
  href: string;
  label: string;
};

type SiteHeaderProps = {
  links: readonly SiteHeaderLink[];
  className?: string;
  brandName?: string;
};

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
      <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  ) : (
    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function HeaderLink({ href, label, onNavigate }: SiteHeaderLink & { onNavigate?: () => void }) {
  const className = "header-link";

  if (href.startsWith("#")) {
    return (
      <a className={className} href={href} onClick={onNavigate}>
        {label}
      </a>
    );
  }

  return (
    <Link className={className} href={href} onClick={onNavigate}>
      {label}
    </Link>
  );
}

export function SiteHeader({ links, className = "", brandName = "Alex Bereanu" }: SiteHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const mainContent = document.getElementById("main-content");
    const previousAriaHidden = mainContent ? mainContent.getAttribute("aria-hidden") : null;
    document.body.style.overflow = "hidden";
    if (mainContent) {
      mainContent.inert = true;
      mainContent.setAttribute("aria-hidden", "true");
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu(true);
        return;
      }

      if (event.key === "Tab" && drawerRef.current) {
        const focusable = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    drawerRef.current?.querySelector<HTMLElement>("a")?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (mainContent) {
        mainContent.inert = false;
        if (previousAriaHidden === null) mainContent.removeAttribute("aria-hidden");
        else mainContent.setAttribute("aria-hidden", previousAriaHidden);
      }
    };
  }, [isOpen]);

  function closeMenu(restoreFocus = false): void {
    setIsOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => window.requestAnimationFrame(() => toggleRef.current?.focus()));
  }

  return (
    <header className={`site-header ${className}`.trim()}>
      <div className="site-header-inner">
        <Link aria-label={`${brandName} home`} className="header-brand" href="/">
          {brandName}
        </Link>

        <nav aria-label="Primary navigation" className="header-nav header-nav-desktop">
          {links.map((link) => (
            <HeaderLink key={`${link.href}-${link.label}`} {...link} />
          ))}
        </nav>

        <button
          ref={toggleRef}
          aria-controls="mobile-navigation"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
          className="mobile-menu-toggle"
          type="button"
          onClick={() => setIsOpen((current) => !current)}
        >
          <MenuIcon open={isOpen} />
        </button>
      </div>

      {isOpen ? createPortal(
        <div className="mobile-menu-layer">
          <button aria-label="Dismiss navigation overlay" className="mobile-menu-scrim" type="button" tabIndex={-1} onClick={() => closeMenu(true)} />
          <div
            ref={drawerRef}
            aria-label="Mobile navigation"
            aria-modal="true"
            className="mobile-menu-drawer"
            id="mobile-navigation"
            role="dialog"
          >
            <button aria-label="Close navigation menu" className="mobile-drawer-close" type="button" onClick={() => closeMenu(true)}>
              <MenuIcon open />
            </button>
            <nav aria-label="Mobile primary navigation" className="mobile-menu-links">
              {links.map((link) => (
                <HeaderLink key={`${link.href}-${link.label}`} {...link} onNavigate={() => closeMenu(false)} />
              ))}
            </nav>
          </div>
        </div>,
        document.body,
      ) : null}
    </header>
  );
}
