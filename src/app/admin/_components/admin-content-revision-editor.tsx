"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type { SiteContentDefinition } from "@/lib/site-content-registry";

type RevisionEditorProps = {
  definition: SiteContentDefinition;
  values: Record<string, string>;
  csrfToken: string;
  returnTo: string;
  baseRevisionId?: string;
  statusLabel: string;
  initialImageSrc?: string;
  imageAlt?: string;
  imageFocalX?: number;
  imageFocalY?: number;
  publicImagesConfigured: boolean;
};

export function AdminContentRevisionEditor({
  definition, values, csrfToken, returnTo, baseRevisionId, statusLabel, initialImageSrc,
  imageAlt, imageFocalX, imageFocalY, publicImagesConfigured,
}: RevisionEditorProps) {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <form
      className="admin-form-grid"
      action="/admin/actions/site-content/draft"
      method="post"
      encType="multipart/form-data"
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
    >
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="key" value={definition.key} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {baseRevisionId ? <input type="hidden" name="baseRevisionId" value={baseRevisionId} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <div><p className="admin-eyebrow">Editing {statusLabel}</p><p className="mt-1 text-sm text-neutral-600">Saving creates a new immutable draft. The live website changes only after Publish.</p></div>
        {dirty ? <span className="admin-status admin-status-warning" aria-live="polite">Unsaved changes</span> : <span className="admin-status">No local changes</span>}
      </div>

      <div className="admin-form-grid admin-form-grid-two">
        {definition.fields.map((field) => (
          <label className={`admin-form-field ${field.kind === "textarea" ? "sm:col-span-2" : ""}`} key={field.name}>
            <span>{field.label}{field.required ? " *" : ""}</span>
            {field.kind === "textarea" ? (
              <textarea name={field.name} defaultValue={values[field.name] ?? ""} maxLength={field.maxLength} rows={field.name === "body" || field.name === "ctaBody" ? 6 : 3} required={field.required} />
            ) : (
              <input name={field.name} defaultValue={values[field.name] ?? ""} maxLength={field.maxLength} required={field.required} type={field.kind === "url" ? "url" : "text"} />
            )}
            {field.helper ? <span className="admin-form-helper">{field.helper}</span> : null}
          </label>
        ))}
      </div>

      {definition.supportsImage ? (
        <fieldset className="grid gap-4 rounded border border-neutral-200 p-4 md:grid-cols-[14rem_minmax(0,1fr)]">
          <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">Page asset</legend>
          <div className={`relative overflow-hidden rounded bg-neutral-200 ${definition.imageAspect === "portrait" ? "aspect-[4/5]" : "aspect-[4/3]"}`}>
            {initialImageSrc ? <Image src={initialImageSrc} alt={imageAlt || definition.adminLabel} fill sizes="224px" className="object-cover" style={{ objectPosition: `${(imageFocalX ?? 0.5) * 100}% ${(imageFocalY ?? 0.5) * 100}%` }} unoptimized /> : <div className="flex h-full items-center justify-center p-4 text-center text-xs uppercase text-neutral-500">No page image</div>}
          </div>
          <div className="admin-form-grid content-start">
            <label className="admin-form-field"><span>Image alt text</span><input name="imageAlt" defaultValue={imageAlt ?? ""} maxLength={220} /><span className="admin-form-helper">Describe the meaningful subject and context. Leave empty only for a decorative image.</span></label>
            <label className="admin-form-field"><span>Replace draft image</span><input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" /><span className="admin-form-helper">The draft derivatives remain private. Publishing creates new public WebP copies.</span></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="admin-form-field"><span>Focal X (0–1)</span><input name="focalX" type="number" min="0" max="1" step="0.01" defaultValue={imageFocalX ?? ""} /></label>
              <label className="admin-form-field"><span>Focal Y (0–1)</span><input name="focalY" type="number" min="0" max="1" step="0.01" defaultValue={imageFocalY ?? ""} /></label>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="clearImage" /> Remove image from this draft</label>
            {!publicImagesConfigured ? <p className="admin-alert admin-alert-warning">Public storage must be configured before this revision can be published with an image.</p> : null}
          </div>
        </fieldset>
      ) : null}

      <div className="admin-editor-actions">
        <div><p className="text-sm font-semibold">Draft workspace</p><p className="text-xs text-neutral-600">Save before previewing or publishing.</p></div>
        <button className="admin-primary-button" type="submit">Save as new draft</button>
      </div>
    </form>
  );
}
