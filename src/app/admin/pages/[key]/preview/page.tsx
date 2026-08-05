import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { isSiteContentDocumentKey } from "@/lib/site-content-registry";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { isAdminContentPhase3Enabled } from "@/server/services/admin-content-phase3";
import { getPublishedSiteContentDocuments } from "@/server/services/site-content";
import { getAdminContentEditor } from "@/server/services/site-content-revisions";

type PreviewProps = { params: Promise<{ key: string }>; searchParams: Promise<{ revision?: string }> };
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function ContentRevisionPreview({ params, searchParams }: PreviewProps) {
  const { key } = await params;
  const query = await searchParams;
  await requireAdminPageSession(`/admin/pages/${encodeURIComponent(key)}/preview`);
  if (!isAdminContentPhase3Enabled() || !isSiteContentDocumentKey(key) || !query.revision) notFound();
  const [editor, chrome] = await Promise.all([getAdminContentEditor(key, query.revision), getPublishedSiteContentDocuments(["global.brand", "global.navigation", "global.footer"])]);
  const revision = editor.revisions.find((item) => item.id === query.revision);
  if (!revision) notFound();
  const brand = chrome[0]?.values ?? {};
  const navigation = chrome[1]?.values ?? {};
  const footer = chrome[2]?.values ?? {};
  const values = revision.values;
  const previewBrand = key === "global.brand" ? values : brand;
  const previewNavigation = key === "global.navigation" ? values : navigation;
  const previewFooter = key === "global.footer" ? values : footer;
  const imageSrc = revision.imageMediumObjectKey ? `/admin/pages/media/${revision.id}/medium` : undefined;

  return <div className="min-h-dvh bg-white"><div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-amber-950">Private draft preview · {editor.definition.adminLabel} · revision {revision.version}</div><div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-6 sm:px-6 lg:px-8"><SiteHeader brandName={previewBrand.title || "Alex Bereanu"} className="rounded p-4 backdrop-blur" links={[{ href: "#preview", label: previewNavigation.homeLabel || "Home" }, { href: "#preview", label: previewNavigation.portfolioLabel || "Portfolio" }, { href: "#preview", label: previewNavigation.aboutLabel || "About" }, { href: "#preview", label: previewNavigation.connectLabel || "Connect" }]} /><main id="preview" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]"><section className="space-y-5"><p className="editorial-kicker text-neutral-600">{values.subtitle || editor.definition.group}</p><h1 className="editorial-heading text-5xl leading-tight">{values.title || editor.definition.adminLabel}</h1>{values.body ? <p className="max-w-3xl whitespace-pre-wrap text-sm leading-7 text-neutral-700">{values.body}</p> : null}{values.ctaTitle || values.ctaBody ? <div className="rounded border border-neutral-200 bg-neutral-50 p-5"><h2 className="editorial-heading text-3xl">{values.ctaTitle || "Call to action"}</h2>{values.ctaBody ? <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-700">{values.ctaBody}</p> : null}</div> : null}{key === "global.navigation" ? <div className="flex flex-wrap gap-3">{Object.values(values).map((label) => label ? <span className="editorial-button rounded px-4 py-2" key={label}>{label}</span> : null)}</div> : null}</section><aside>{imageSrc ? <div className={`relative overflow-hidden rounded bg-neutral-200 ${editor.definition.imageAspect === "portrait" ? "aspect-[4/5]" : "aspect-[4/3]"}`}><Image src={imageSrc} alt={revision.imageAlt || editor.definition.adminLabel} fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" style={{ objectPosition: `${(revision.imageFocalX ?? 0.5) * 100}% ${(revision.imageFocalY ?? 0.5) * 100}%` }} unoptimized /></div> : <div className="rounded border border-dashed border-neutral-300 p-8 text-sm text-neutral-600">This content region has no draft image.</div>}</aside></main><footer className="flex flex-wrap items-end justify-between gap-5 border-t border-neutral-200 py-8"><div><p className="editorial-heading text-2xl">{previewFooter.title || previewBrand.title || "Alex Bereanu"}</p><p className="text-sm text-neutral-600">{previewFooter.subtitle || previewBrand.subtitle || "The elegance of being there"}</p></div><Link className="header-link" href={`/admin/pages/${encodeURIComponent(key)}?revision=${encodeURIComponent(revision.id)}`}>Back to editor</Link></footer></div></div>;
}
