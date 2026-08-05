import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminAlerts, AdminShell, AdminStatus } from "@/app/admin/_components/admin-chrome";
import { AdminContentRevisionEditor } from "@/app/admin/_components/admin-content-revision-editor";
import { AdminSiteContentEditor } from "@/app/admin/_components/admin-site-content-editor";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { env } from "@/config/env";
import { isSiteContentDocumentKey } from "@/lib/site-content-registry";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { createCsrfToken } from "@/server/security/request-protection";
import { isAdminContentPhase3Enabled } from "@/server/services/admin-content-phase3";
import { getEditableSiteContentEntries } from "@/server/services/site-content";
import { getAdminContentEditor } from "@/server/services/site-content-revisions";

type PageEditorProps = { params: Promise<{ key: string }>; searchParams: Promise<{ notice?: string; error?: string; revision?: string }> };
export const dynamic = "force-dynamic";

export default async function PageEditor({ params, searchParams }: PageEditorProps) {
  const { key } = await params;
  await requireAdminPageSession(`/admin/pages/${encodeURIComponent(key)}`);
  const query = await searchParams;
  const csrfToken = createCsrfToken();
  const phase3 = isAdminContentPhase3Enabled();

  if (!phase3) {
    const entries = await getEditableSiteContentEntries();
    const content = entries.find((entry) => entry.key === key);
    if (!content) notFound();
    const returnTo = `/admin/pages/${encodeURIComponent(content.key)}`;
    return <AdminShell active="pages" eyebrow="Website pages / Compatibility editor" title={content.adminLabel} description={content.adminDescription} csrfToken={csrfToken} actions={<Link className="admin-secondary-button" href="/admin/pages">All pages</Link>}><AdminAlerts error={query.error} notice={query.notice} /><p className="admin-alert admin-alert-warning">Draft revisions are disabled until the Phase 3 migration gate passes. Saving here updates the existing live record immediately.</p><section className="admin-panel max-w-4xl"><AdminSiteContentEditor content={content} csrfToken={csrfToken} returnTo={returnTo} publicImagesConfigured={Boolean(env.R2_PUBLIC_BASE_URL)} /></section></AdminShell>;
  }

  if (!env.DATABASE_URL || !isSiteContentDocumentKey(key)) notFound();
  const editor = await getAdminContentEditor(key, query.revision);
  if (query.revision && !editor.revisions.some((revision) => revision.id === query.revision)) notFound();
  const selected = editor.selected;
  const values = selected?.values ?? editor.publishedDocument.values;
  const returnTo = `/admin/pages/${encodeURIComponent(key)}`;
  const initialImageSrc = selected?.imageSmallObjectKey ? `/admin/pages/media/${selected.id}/small` : editor.publishedDocument.imageSmallSrc ?? editor.publishedDocument.imageSrc;
  const compareAgainst = editor.published;

  return (
    <AdminShell active="pages" eyebrow={`Website pages / ${editor.definition.group}`} title={editor.definition.adminLabel} description={editor.definition.adminDescription} csrfToken={csrfToken} actions={<><Link className="admin-secondary-button" href="/admin/pages">All pages</Link>{selected ? <Link className="admin-primary-button" href={`/admin/pages/${encodeURIComponent(key)}/preview?revision=${encodeURIComponent(selected.id)}`} target="_blank">Preview draft</Link> : null}</>}>
      <AdminAlerts error={query.error} notice={query.notice} />
      <div className="flex flex-wrap gap-2"><AdminStatus>{editor.definition.key}</AdminStatus><AdminStatus tone={selected?.status === "PUBLISHED" ? "success" : selected ? "warning" : "neutral"}>{selected ? `${selected.status} v${selected.version}` : "Code defaults"}</AdminStatus>{editor.published ? <AdminStatus tone="success">Live v{editor.published.version}</AdminStatus> : <AdminStatus>Defaults live</AdminStatus>}</div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="admin-panel min-w-0"><AdminContentRevisionEditor definition={editor.definition} values={values} csrfToken={csrfToken} returnTo={returnTo} baseRevisionId={selected?.id} statusLabel={selected ? `${selected.status.toLowerCase()} revision ${selected.version}` : "published defaults"} initialImageSrc={initialImageSrc} imageAlt={selected?.imageAlt ?? editor.publishedDocument.imageAlt} imageFocalX={selected?.imageFocalX ?? editor.publishedDocument.imageFocalX} imageFocalY={selected?.imageFocalY ?? editor.publishedDocument.imageFocalY} publicImagesConfigured={Boolean(env.R2_PUBLIC_BASE_URL)} /></section>
        <aside className="grid content-start gap-4">
          <section className="admin-panel"><div className="admin-panel-header"><div><h2>Publication</h2><p className="admin-panel-copy">Only a saved Draft can be published. Publishing is atomic and invalidates this page’s cache.</p></div></div>{selected?.status === "DRAFT" ? <form action="/admin/actions/site-content/publish" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="key" value={key} /><input type="hidden" name="revisionId" value={selected.id} /><ConfirmSubmitButton className="admin-primary-button w-full" label={`Publish revision ${selected.version}`} confirmLabel="Publish to live website" /></form> : <p className="admin-empty-state text-sm text-neutral-600">Save a new draft to create a publishable revision.</p>}</section>
          <section className="admin-panel"><div className="admin-panel-header"><div><h2>Compare with live</h2><p className="admin-panel-copy">A compact field comparison. Images are compared in Preview.</p></div></div><dl className="grid gap-3">{editor.definition.fields.map((field) => { const draftValue = values[field.name] ?? ""; const liveValue = compareAgainst?.values[field.name] ?? editor.publishedDocument.values[field.name] ?? ""; const changed = draftValue !== liveValue; return <div key={field.name} className="rounded border border-neutral-200 p-3"><dt className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-600"><span>{field.label}</span><AdminStatus tone={changed ? "warning" : "neutral"}>{changed ? "Changed" : "Same"}</AdminStatus></dt><dd className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm">{draftValue || "Empty"}</dd>{changed ? <p className="mt-2 border-t border-neutral-100 pt-2 text-xs text-neutral-500">Live: {liveValue || "Empty"}</p> : null}</div>; })}</dl></section>
        </aside>
      </div>
      <section className="admin-panel"><div className="admin-panel-header"><div><h2>Revision history</h2><p className="admin-panel-copy">Immutable snapshots. Restoring creates a new Draft and never rewrites history.</p></div></div>{editor.revisions.length === 0 ? <p className="admin-empty-state text-sm text-neutral-600">No revisions yet. Save the first draft above.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Version</th><th>Status</th><th>Updated</th><th>Origin</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{editor.revisions.map((revision) => <tr key={revision.id}><td>v{revision.version}</td><td><AdminStatus tone={revision.status === "PUBLISHED" ? "success" : revision.status === "DRAFT" ? "warning" : "neutral"}>{revision.status}</AdminStatus></td><td>{new Date(revision.updatedAt).toLocaleString()}</td><td>{revision.restoredFromRevisionId ? "Restored copy" : "Saved revision"}</td><td><div className="flex flex-wrap gap-2"><Link className="admin-secondary-button" href={`${returnTo}?revision=${encodeURIComponent(revision.id)}`}>View</Link><Link className="admin-secondary-button" href={`${returnTo}/preview?revision=${encodeURIComponent(revision.id)}`} target="_blank">Preview</Link><form action="/admin/actions/site-content/restore" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="key" value={key} /><input type="hidden" name="revisionId" value={revision.id} /><button className="admin-secondary-button" type="submit">Restore as draft</button></form></div></td></tr>)}</tbody></table></div>}</section>
    </AdminShell>
  );
}
