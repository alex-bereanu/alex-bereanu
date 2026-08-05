import { SITE_CONTENT_PARAGRAPH_HELPER } from "@/lib/site-content-registry";
import type { ResolvedSiteContent } from "@/server/services/site-content";

export function AdminSiteContentEditor({
  content,
  csrfToken,
  returnTo,
  publicImagesConfigured,
}: {
  content: ResolvedSiteContent;
  csrfToken: string;
  returnTo: string;
  publicImagesConfigured: boolean;
}) {
  return (
    <form className="admin-form-grid" action="/admin/actions/site-content/update" method="post" encType="multipart/form-data">
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="key" value={content.key} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <label className="admin-form-field"><span>Title</span><input name="title" defaultValue={content.title} /></label>
      {!content.isSocialUrl ? <label className="admin-form-field"><span>Subtitle / eyebrow (optional)</span><input name="subtitle" defaultValue={content.subtitle ?? ""} /></label> : null}
      <label className="admin-form-field"><span>{content.isSocialUrl ? "Instagram URL" : "Paragraph"}</span>{content.isSocialUrl ? <input name="body" defaultValue={content.body} placeholder="https://www.instagram.com/yourprofile" type="url" /> : <><textarea name="body" defaultValue={content.body} rows={6} /><span className="admin-form-helper">{SITE_CONTENT_PARAGRAPH_HELPER}</span></>}</label>

      {content.supportsCta ? <div className="admin-form-grid admin-form-grid-two"><label className="admin-form-field"><span>Inquiry title (optional)</span><input name="ctaTitle" defaultValue={content.ctaTitle ?? ""} /></label><label className="admin-form-field"><span>Inquiry paragraph (optional)</span><textarea name="ctaBody" defaultValue={content.ctaBody ?? ""} rows={4} /><span className="admin-form-helper">{SITE_CONTENT_PARAGRAPH_HELPER}</span></label></div> : null}

      {content.supportsImage ? (
        <fieldset className="grid gap-4 rounded border border-neutral-200 p-4 md:grid-cols-[12rem_minmax(0,1fr)]">
          <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">Page image</legend>
          <div className={`overflow-hidden rounded bg-neutral-200 ${content.key === "home.about" ? "aspect-[4/5]" : "aspect-[4/3]"}`}>
            {content.imageSrc ? <div aria-label={content.imageAlt ?? content.title} className="h-full w-full bg-cover bg-center" role="img" style={{ backgroundImage: `url(${content.imageSmallSrc ?? content.imageSrc})` }} /> : <div className="flex h-full items-center justify-center p-4 text-center text-xs uppercase text-neutral-500">No page image</div>}
          </div>
          <div className="admin-form-grid content-start">
            <label className="admin-form-field"><span>Image alt text</span><input name="imageAlt" defaultValue={content.imageAlt ?? ""} /></label>
            <label className="admin-form-field"><span>Replace image</span><input name="imageFile" type="file" accept="image/*" /><span className="admin-form-helper">Use a high-quality JPG, PNG, or WebP. Optimized derivatives are generated after upload.</span></label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="clearImage" /> Remove current image</label>
            {!publicImagesConfigured ? <p className="admin-alert admin-alert-warning">R2_PUBLIC_BASE_URL is required before uploaded page images can render publicly.</p> : null}
          </div>
        </fieldset>
      ) : null}

      <div><button className="admin-primary-button" type="submit">Save page content</button></div>
    </form>
  );
}
