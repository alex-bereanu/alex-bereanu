import Link from "next/link";

import { errorLabels, noticeLabels } from "@/app/admin/_lib/admin-options";

type AdminAlertsProps = {
  error?: string;
  notice?: string;
};

type AdminNavProps = {
  active: "overview" | "galleries" | "tickets";
};

const navItems = [
  { href: "/admin", label: "Overview", value: "overview" },
  { href: "/admin/galleries", label: "Galleries", value: "galleries" },
  { href: "/admin/tickets", label: "Tickets", value: "tickets" },
] as const;

export function AdminAlerts({ error, notice }: AdminAlertsProps) {
  return (
    <>
      {notice ? (
        <p
          aria-live="polite"
          className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {noticeLabels[notice] ?? "Action completed."}
        </p>
      ) : null}

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {errorLabels[error] ?? "Action failed."}
        </p>
      ) : null}
    </>
  );
}

export function AdminNav({ active }: AdminNavProps) {
  return (
    <nav aria-label="Admin sections" className="flex flex-wrap gap-2">
      {navItems.map((item) => {
        const isActive = item.value === active;

        return (
          <Link
            key={item.href}
            className={`inline-flex min-h-11 items-center rounded border px-3 py-2 text-xs font-medium transition ${
              isActive ? "border-black bg-black text-white" : "bg-white text-neutral-800 hover:bg-neutral-50"
            }`}
            href={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

type AdminFooterProps = {
  csrfToken?: string;
};

export function AdminFooter({ csrfToken }: AdminFooterProps) {
  return (
    <div className="flex items-center gap-4">
      <form action="/api/admin/logout" method="post">
        {csrfToken ? <input type="hidden" name="csrfToken" value={csrfToken} /> : null}
        <button className="min-h-11 rounded border bg-white px-4 py-2 text-sm" type="submit">
          Sign out
        </button>
      </form>

      <Link className="inline-flex min-h-11 items-center text-sm underline" href="/">
        Back to website
      </Link>
    </div>
  );
}
