import { GalleryCategory, GalleryVisibility, MediaJobStatus, StorageDeletionStatus } from "@/generated/prisma/client";
import Link from "next/link";

import { AdminAlerts, AdminFooter, AdminNav } from "@/app/admin/_components/admin-chrome";
import { categoryLabels, resolveCreateCategory } from "@/app/admin/_lib/admin-options";
import { env } from "@/config/env";
import { AdminGalleryCreateForm } from "@/components/admin-gallery-create-form";
import { prisma } from "@/lib/db";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { createCsrfToken } from "@/server/security/request-protection";
import { getEditableSiteContentEntries } from "@/server/services/site-content";

type AdminPageProps = {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    createCategory?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requireAdminPageSession("/admin");
  const resolvedSearchParams = await searchParams;
  const csrfToken = createCsrfToken();

  if (!env.DATABASE_URL) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <h1 className="text-3xl font-semibold">Master Admin Panel</h1>
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          DATABASE_URL is not configured. Set it in <code>.env.local</code> to enable admin features.
        </p>
        <AdminFooter csrfToken={csrfToken} />
      </main>
    );
  }

  const createCategoryFilter = resolveCreateCategory(resolvedSearchParams.createCategory);

  const [
    activeGalleriesCount,
    pendingTicketsCount,
    activeLinksCount,
    pendingDeletionCount,
    pendingMediaJobCount,
    failedMediaJobs,
    siteContentEntries,
  ] = await Promise.all([
    prisma.gallery.count({ where: { isActive: true } }),
    prisma.ticket.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }),
    prisma.galleryShareLink.count({ where: { isActive: true, revokedAt: null } }),
    prisma.storageDeletionJob.count({ where: { status: StorageDeletionStatus.PENDING } }),
    prisma.mediaProcessingJob.count({
      where: { status: { in: [MediaJobStatus.PENDING, MediaJobStatus.PROCESSING, MediaJobStatus.RETRY] } },
    }),
    prisma.mediaProcessingJob.findMany({
      where: { status: MediaJobStatus.FAILED },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        attempts: true,
        lastError: true,
        updatedAt: true,
        asset: { select: { originalFilename: true } },
        uploadSession: { select: { originalFilename: true } },
      },
    }),
    getEditableSiteContentEntries(),
  ]);

  const categoryOptions = Object.values(GalleryCategory);
  const visibilityOptions = Object.values(GalleryVisibility);
  const mainCategoryOptions = Object.values(GalleryCategory).filter((category) => category !== GalleryCategory.CUSTOM);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <header className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Master Admin Panel</h1>
          <p className="text-sm text-neutral-700">
            Create galleries, edit website copy and page photos, then jump into dedicated pages for gallery operations and tickets.
          </p>
        </div>
        <AdminNav active="overview" />
      </header>

      <AdminAlerts error={resolvedSearchParams.error} notice={resolvedSearchParams.notice} />

      {pendingDeletionCount > 0 ? (
        <section className="flex flex-col gap-3 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {pendingDeletionCount} storage deletion {pendingDeletionCount === 1 ? "job is" : "jobs are"} waiting to be retried.
          </p>
          <form action="/admin/actions/storage-deletions/retry" method="post">
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="limit" value="200" />
            <button className="rounded bg-black px-4 py-2 font-medium text-white" type="submit">
              Retry deletions
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded border bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Media processing</h2>
            <p className="mt-1 text-xs text-neutral-600">
              {pendingMediaJobCount} queued or active {pendingMediaJobCount === 1 ? "job" : "jobs"}. Uploads become visible only after verification succeeds.
            </p>
          </div>
          <form action="/admin/actions/media-jobs/run" method="post">
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="limit" value="5" />
            <button className="rounded bg-black px-4 py-2 text-sm font-medium text-white" type="submit">
              Process up to 5 jobs
            </button>
          </form>
        </div>

        {failedMediaJobs.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b text-neutral-600">
                  <th className="px-2 py-2">File</th>
                  <th className="px-2 py-2">Job</th>
                  <th className="px-2 py-2">Safe failure code</th>
                  <th className="px-2 py-2">Attempts</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {failedMediaJobs.map((job) => (
                  <tr key={job.id} className="border-b">
                    <td className="px-2 py-2">{job.asset?.originalFilename ?? job.uploadSession?.originalFilename ?? "Unknown file"}</td>
                    <td className="px-2 py-2">{job.type}</td>
                    <td className="px-2 py-2 font-mono">{job.lastError ?? "unspecified_failure"}</td>
                    <td className="px-2 py-2">{job.attempts}</td>
                    <td className="px-2 py-2">
                      <form action="/admin/actions/media-jobs/retry" method="post">
                        <input type="hidden" name="csrfToken" value={csrfToken} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button className="rounded border px-2 py-1 font-medium" type="submit">Retry</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        <Link className="rounded border bg-white p-4 transition hover:bg-neutral-50" href="/admin/galleries">
          <h2 className="text-sm font-semibold">Active galleries</h2>
          <p className="mt-2 text-3xl font-semibold">{activeGalleriesCount}</p>
        </Link>
        <Link className="rounded border bg-white p-4 transition hover:bg-neutral-50" href="/admin/tickets">
          <h2 className="text-sm font-semibold">Pending tickets</h2>
          <p className="mt-2 text-3xl font-semibold">{pendingTicketsCount}</p>
        </Link>
        <Link className="rounded border bg-white p-4 transition hover:bg-neutral-50" href="/admin/galleries?view=expanded">
          <h2 className="text-sm font-semibold">Active custom links</h2>
          <p className="mt-2 text-3xl font-semibold">{activeLinksCount}</p>
        </Link>
        <a className="rounded border bg-white p-4 transition hover:bg-neutral-50" href="#site-content">
          <h2 className="text-sm font-semibold">Editable pages</h2>
          <p className="mt-2 text-3xl font-semibold">{siteContentEntries.length}</p>
        </a>
      </section>

      <section className="rounded border bg-white p-5">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Create gallery</h2>
          <p className="text-sm text-neutral-700">
            Pick a category shortcut to focus the form on a specific portfolio section.
          </p>
        </div>

        <AdminGalleryCreateForm
          categoryLabels={categoryLabels}
          categoryOptions={categoryOptions}
          csrfToken={csrfToken}
          initialCategory={createCategoryFilter}
          mainCategoryOptions={mainCategoryOptions}
          visibilityOptions={visibilityOptions}
        />
      </section>

      <section id="site-content" className="space-y-4 rounded border bg-white p-5">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Website text and page photos</h2>
          <p className="text-sm text-neutral-700">
            Edit the visible titles, subtitles, paragraphs, inquiry copy, and optional page images used across the public site.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {siteContentEntries.map((content) => (
            <article key={content.key} className="rounded border border-neutral-200 bg-neutral-50 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">{content.adminLabel}</h3>
                <p className="text-xs text-neutral-600">{content.adminDescription}</p>
              </div>

              <form
                className="mt-4 grid gap-3"
                action="/admin/actions/site-content/update"
                method="post"
                encType="multipart/form-data"
              >
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <input type="hidden" name="key" value={content.key} />

                <label className="grid gap-1 text-xs font-medium text-neutral-700">
                  Title
                  <input className="rounded border bg-white px-3 py-2 text-sm font-normal" name="title" defaultValue={content.title} />
                </label>

                {!content.isSocialUrl ? (
                  <label className="grid gap-1 text-xs font-medium text-neutral-700">
                    Subtitle / eyebrow
                    <input
                      className="rounded border bg-white px-3 py-2 text-sm font-normal"
                      name="subtitle"
                      defaultValue={content.subtitle ?? ""}
                      placeholder="Optional"
                    />
                  </label>
                ) : null}

                <label className="grid gap-1 text-xs font-medium text-neutral-700">
                  {content.isSocialUrl ? "Instagram URL" : "Paragraph"}
                  {content.isSocialUrl ? (
                    <input
                      className="rounded border bg-white px-3 py-2 text-sm font-normal"
                      name="body"
                      defaultValue={content.body}
                      placeholder="https://www.instagram.com/yourprofile"
                      type="url"
                    />
                  ) : (
                    <textarea
                      className="rounded border bg-white px-3 py-2 text-sm font-normal"
                      name="body"
                      defaultValue={content.body}
                      rows={4}
                    />
                  )}
                </label>

                {content.supportsCta ? (
                  <>
                    <label className="grid gap-1 text-xs font-medium text-neutral-700">
                      Inquiry title
                      <input
                        className="rounded border bg-white px-3 py-2 text-sm font-normal"
                        name="ctaTitle"
                        defaultValue={content.ctaTitle ?? ""}
                        placeholder="Optional"
                      />
                    </label>

                    <label className="grid gap-1 text-xs font-medium text-neutral-700">
                      Inquiry paragraph
                      <textarea
                        className="rounded border bg-white px-3 py-2 text-sm font-normal"
                        name="ctaBody"
                        defaultValue={content.ctaBody ?? ""}
                        rows={3}
                        placeholder="Optional"
                      />
                    </label>
                  </>
                ) : null}

                {content.supportsImage ? (
                  <div className="grid gap-3 md:grid-cols-[140px_1fr]">
                    <div
                      className={`overflow-hidden rounded bg-neutral-200 ${
                        content.key === "home.about" ? "aspect-[4/5]" : "aspect-[4/3]"
                      }`}
                    >
                      {content.imageSrc ? (
                        <div
                          aria-label={content.imageAlt ?? content.title}
                          className="h-full w-full bg-cover bg-center"
                          role="img"
                          style={{ backgroundImage: `url(${content.imageSmallSrc ?? content.imageSrc})` }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-3 text-center text-[11px] uppercase text-neutral-500">
                          No page photo
                        </div>
                      )}
                    </div>

                    <div className="grid content-start gap-2">
                      <label className="grid gap-1 text-xs font-medium text-neutral-700">
                        Image alt text
                        <input
                          className="rounded border bg-white px-3 py-2 text-sm font-normal"
                          name="imageAlt"
                          defaultValue={content.imageAlt ?? ""}
                          placeholder="Optional"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-neutral-700">
                        Replace photo
                        <input
                          className="rounded border bg-white px-3 py-2 text-xs font-normal"
                          name="imageFile"
                          type="file"
                          accept="image/*"
                        />
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs text-neutral-700">
                        <input type="checkbox" name="clearImage" /> Clear current photo
                      </label>
                      {!env.R2_PUBLIC_BASE_URL ? (
                        <p className="text-xs text-amber-800">
                          R2_PUBLIC_BASE_URL must be configured for uploaded page photos to render publicly.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <button className="rounded bg-black px-4 py-2 text-sm font-medium text-white" type="submit">
                  Save page content
                </button>
              </form>
            </article>
          ))}
        </div>
      </section>

      <AdminFooter csrfToken={csrfToken} />
    </main>
  );
}
