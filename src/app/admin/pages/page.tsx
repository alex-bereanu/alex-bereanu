import Link from "next/link";

import { AdminAlerts, AdminShell, AdminStatus } from "@/app/admin/_components/admin-chrome";
import { env } from "@/config/env";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { createCsrfToken } from "@/server/security/request-protection";
import { isAdminContentPhase3Enabled } from "@/server/services/admin-content-phase3";
import { getEditableSiteContentEntries } from "@/server/services/site-content";
import { getAdminContentSummaries } from "@/server/services/site-content-revisions";

type AdminPagesProps = { searchParams: Promise<{ notice?: string; error?: string }> };
export const dynamic = "force-dynamic";

export default async function AdminPages({ searchParams }: AdminPagesProps) {
  await requireAdminPageSession("/admin/pages");
  const params = await searchParams;
  const csrfToken = createCsrfToken();
  const phase3 = isAdminContentPhase3Enabled();
  const summaries = phase3 && env.DATABASE_URL ? await getAdminContentSummaries() : null;
  const legacyEntries = !phase3 ? await getEditableSiteContentEntries() : [];

  return (
    <AdminShell active="pages" title="Website pages" description="Typed content, private draft previews, explicit publishing, and immutable revision history." csrfToken={csrfToken}>
      <AdminAlerts error={params.error} notice={params.notice} />
      {!phase3 ? <p className="admin-alert admin-alert-warning">Phase 3 is installed but disabled until its additive migration passes the Phase 0 backup, direct-connection, staging, and authorization gates. The immediate-publish compatibility editor remains available.</p> : null}
      {!env.DATABASE_URL ? <p className="admin-alert admin-alert-warning">Database overrides are unavailable; the editor is showing code defaults.</p> : null}

      {summaries ? (
        <div className="grid gap-6">
          {["Global", "Homepage", "Portfolio", "Wedding landing", "Client gallery"].map((group) => {
            const entries = summaries.filter((summary) => summary.definition.group === group);
            if (entries.length === 0) return null;
            return <section className="grid gap-3" key={group}><div><p className="admin-eyebrow">{group}</p><h2 className="mt-1">{group} content</h2></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{entries.map((entry) => (
              <article key={entry.definition.key} className="admin-panel flex min-h-56 flex-col justify-between gap-5">
                <div><div className="flex flex-wrap items-start justify-between gap-3"><p className="admin-eyebrow">{entry.definition.key}</p><div className="flex flex-wrap gap-2">{entry.latestDraft ? <AdminStatus tone="warning">Draft v{entry.latestDraft.version}</AdminStatus> : null}<AdminStatus tone={entry.published ? "success" : "neutral"}>{entry.published ? `Published v${entry.published.version}` : "Defaults live"}</AdminStatus></div></div><h3 className="mt-3 text-xl">{entry.definition.adminLabel}</h3><p className="admin-panel-copy">{entry.definition.adminDescription}</p><p className="mt-4 text-xs text-neutral-600">{entry.revisionCount} revision{entry.revisionCount === 1 ? "" : "s"}{entry.publishedAt ? ` · Published ${new Date(entry.publishedAt).toLocaleString()}` : ""}</p></div>
                <Link className="admin-secondary-button self-start" href={`/admin/pages/${encodeURIComponent(entry.definition.key)}${entry.latestDraft ? `?revision=${encodeURIComponent(entry.latestDraft.id)}` : ""}`}>Open editor</Link>
              </article>
            ))}</div></section>;
          })}
        </div>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {legacyEntries.map((entry) => <article key={entry.key} className="admin-panel flex min-h-56 flex-col justify-between gap-5"><div><div className="flex items-start justify-between gap-3"><p className="admin-eyebrow">{entry.key}</p>{entry.supportsImage ? <AdminStatus>Image</AdminStatus> : null}</div><h2 className="mt-3">{entry.adminLabel}</h2><p className="admin-panel-copy">{entry.adminDescription}</p><p className="mt-4 line-clamp-3 text-sm leading-6 text-neutral-700">{entry.body || "No paragraph currently set."}</p></div><Link className="admin-secondary-button self-start" href={`/admin/pages/${encodeURIComponent(entry.key)}`}>Edit compatibility content</Link></article>)}
        </section>
      )}
    </AdminShell>
  );
}
