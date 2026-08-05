import type { ReactNode } from "react";
import Link from "next/link";

import { errorLabels, noticeLabels } from "@/app/admin/_lib/admin-options";

export type AdminSection = "overview" | "galleries" | "pages" | "tickets" | "operations";

type AdminAlertsProps = {
  error?: string;
  notice?: string;
};

const navItems: Array<{ href: string; label: string; shortLabel: string; value: AdminSection }> = [
  { href: "/admin", label: "Dashboard", shortLabel: "Home", value: "overview" },
  { href: "/admin/galleries", label: "Galleries", shortLabel: "Galleries", value: "galleries" },
  { href: "/admin/pages", label: "Website pages", shortLabel: "Pages", value: "pages" },
  { href: "/admin/tickets", label: "Client tickets", shortLabel: "Tickets", value: "tickets" },
  { href: "/admin/operations", label: "Operations", shortLabel: "Ops", value: "operations" },
];

export function AdminAlerts({ error, notice }: AdminAlertsProps) {
  return (
    <div className="grid gap-3">
      {notice ? (
        <p aria-live="polite" className="admin-alert admin-alert-success" role="status">
          {noticeLabels[notice] ?? "Action completed."}
        </p>
      ) : null}
      {error ? (
        <p className="admin-alert admin-alert-error" role="alert">
          {errorLabels[error] ?? "Action failed."}
        </p>
      ) : null}
    </div>
  );
}

export function AdminNav({ active }: { active: AdminSection }) {
  return (
    <nav aria-label="Admin sections" className="admin-nav">
      {navItems.map((item) => (
        <Link
          key={item.href}
          aria-current={item.value === active ? "page" : undefined}
          className="admin-nav-link"
          data-active={item.value === active ? "true" : "false"}
          href={item.href}
        >
          <span className="admin-nav-label">{item.label}</span>
          <span className="admin-nav-label-short">{item.shortLabel}</span>
        </Link>
      ))}
    </nav>
  );
}

export function AdminFooter({ csrfToken }: { csrfToken?: string }) {
  return (
    <div className="admin-footer">
      <form action="/api/admin/logout" method="post">
        {csrfToken ? <input type="hidden" name="csrfToken" value={csrfToken} /> : null}
        <button className="admin-secondary-button" type="submit">Sign out</button>
      </form>
      <Link className="admin-text-link" href="/">View website</Link>
    </div>
  );
}

type AdminShellProps = {
  active: AdminSection;
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  csrfToken: string;
  children: ReactNode;
};

export function AdminShell({ active, title, eyebrow = "Studio admin", description, actions, csrfToken, children }: AdminShellProps) {
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main">Skip to admin content</a>
      <aside className="admin-sidebar">
        <div>
          <Link className="admin-brand" href="/admin" aria-label="Alex Bereanu admin dashboard">
            <span>AB</span>
            <small>Studio console</small>
          </Link>
          <AdminNav active={active} />
        </div>
        <AdminFooter csrfToken={csrfToken} />
      </aside>

      <div className="admin-workspace">
        <div className="admin-mobile-bar">
          <Link className="admin-mobile-brand" href="/admin">AB / Admin</Link>
          <Link className="admin-text-link" href="/">Website</Link>
        </div>
        <div className="admin-mobile-nav"><AdminNav active={active} /></div>
        <main id="admin-main" className="admin-main">
          <header className="admin-page-header">
            <div className="min-w-0">
              <p className="admin-eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              {description ? <p className="admin-page-description">{description}</p> : null}
            </div>
            {actions ? <div className="admin-page-actions">{actions}</div> : null}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

export function AdminEmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <section className="admin-empty-state">
      <p className="admin-eyebrow">Nothing to show</p>
      <h2>{title}</h2>
      <p>{body}</p>
      {action ? <div>{action}</div> : null}
    </section>
  );
}

export function AdminStatus({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger"; children: ReactNode }) {
  return <span className={`admin-status admin-status-${tone}`}>{children}</span>;
}
