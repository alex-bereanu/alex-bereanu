import { GalleryCategory, GalleryVisibility, Prisma, TicketStatus } from "@prisma/client";
import Link from "next/link";

import { env } from "@/config/env";
import { AdminArchiveUpload } from "@/components/admin-archive-upload";
import { AdminAssetManager } from "@/components/admin-asset-manager";
import { AdminGalleryCreateForm } from "@/components/admin-gallery-create-form";
import { prisma } from "@/lib/db";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { getEditableSiteContentEntries } from "@/server/services/site-content";

type AdminPageProps = {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    ticketQ?: string;
    ticketStatus?: string;
    galleryQ?: string;
    createCategory?: string;
  }>;
};

const noticeLabels: Record<string, string> = {
  gallery_created: "Gallery created.",
  gallery_updated: "Gallery updated.",
  gallery_deleted: "Gallery deleted.",
  share_link_created: "Custom gallery link generated.",
  ticket_status_updated: "Ticket status updated.",
  ticket_reply_sent: "Ticket response processed.",
  asset_deleted: "Asset removed from gallery metadata.",
  archive_deleted: "Gallery ZIP archive deleted from storage and metadata.",
  site_content_updated: "Site text and image content updated.",
};

const errorLabels: Record<string, string> = {
  database_not_configured: "DATABASE_URL is not configured.",
  invalid_gallery_payload: "Invalid gallery payload.",
  gallery_create_failed: "Unable to create gallery.",
  gallery_update_failed: "Unable to update gallery.",
  gallery_delete_failed: "Unable to delete gallery.",
  gallery_not_found: "Gallery not found.",
  invalid_share_link_payload: "Invalid share link payload.",
  share_link_create_failed: "Unable to generate share link.",
  invalid_ticket_status_payload: "Invalid ticket status payload.",
  ticket_status_update_failed: "Unable to update ticket status.",
  invalid_ticket_reply_payload: "Invalid ticket reply payload.",
  ticket_reply_failed: "Unable to process ticket reply.",
  ticket_not_found: "Ticket not found.",
  invalid_asset_delete_payload: "Invalid asset delete payload.",
  asset_delete_failed: "Unable to delete asset.",
  invalid_archive_delete_payload: "Invalid archive delete payload.",
  archive_delete_failed: "Unable to delete archive.",
  invalid_site_content_payload: "Invalid site content payload.",
  site_content_update_failed: "Unable to update site content.",
};

const categoryLabels: Record<GalleryCategory, string> = {
  PORTRAITS: "Portraits",
  AUTOMOTIVE: "Automotive",
  LANDSCAPES: "Places",
  WEDDINGS: "Weddings",
  PRODUCT: "Product",
  CORPORATE: "Corporate",
  CUSTOM: "Custom",
};

function resolveTicketStatusFilter(value: string | undefined): TicketStatus | "ALL" {
  if (!value || value === "ALL") {
    return "ALL";
  }

  if (Object.values(TicketStatus).includes(value as TicketStatus)) {
    return value as TicketStatus;
  }

  return "ALL";
}

function resolveCreateCategory(value: string | undefined): GalleryCategory {
  if (!value) {
    return GalleryCategory.PORTRAITS;
  }

  if (Object.values(GalleryCategory).includes(value as GalleryCategory)) {
    return value as GalleryCategory;
  }

  return GalleryCategory.PORTRAITS;
}

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requireAdminPageSession("/admin");
  const resolvedSearchParams = await searchParams;

  if (!env.DATABASE_URL) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <h1 className="text-3xl font-semibold">Master Admin Panel</h1>
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          DATABASE_URL is not configured. Set it in <code>.env.local</code> to enable admin features.
        </p>
        <form action="/api/admin/logout" method="post">
          <button className="rounded border bg-white px-4 py-2 text-sm" type="submit">
            Sign out
          </button>
        </form>
      </main>
    );
  }

  const galleryQuery = resolvedSearchParams.galleryQ?.trim() ?? "";
  const ticketQuery = resolvedSearchParams.ticketQ?.trim() ?? "";
  const ticketStatusFilter = resolveTicketStatusFilter(resolvedSearchParams.ticketStatus);
  const createCategoryFilter = resolveCreateCategory(resolvedSearchParams.createCategory);

  const galleryWhere: Prisma.GalleryWhereInput = galleryQuery
    ? {
        OR: [
          { title: { contains: galleryQuery, mode: "insensitive" } },
          { slug: { contains: galleryQuery, mode: "insensitive" } },
          { description: { contains: galleryQuery, mode: "insensitive" } },
        ],
      }
    : {};

  const ticketWhere: Prisma.TicketWhereInput = {
    ...(ticketStatusFilter === "ALL" ? {} : { status: ticketStatusFilter }),
    ...(ticketQuery
      ? {
          OR: [
            { firstName: { contains: ticketQuery, mode: "insensitive" } },
            { lastName: { contains: ticketQuery, mode: "insensitive" } },
            { email: { contains: ticketQuery, mode: "insensitive" } },
            { message: { contains: ticketQuery, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [activeGalleriesCount, pendingTicketsCount, activeLinksCount, siteContentEntries, galleries, tickets] =
    await Promise.all([
    prisma.gallery.count({ where: { isActive: true } }),
    prisma.ticket.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }),
    prisma.galleryShareLink.count({ where: { isActive: true } }),
    getEditableSiteContentEntries(),
    prisma.gallery.findMany({
      where: galleryWhere,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            assets: true,
            shareLinks: true,
          },
        },
        assets: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            originalFilename: true,
            storageKey: true,
            smallStorageKey: true,
            mimeType: true,
            width: true,
            height: true,
          },
        },
        shareLinks: {
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true,
            slug: true,
            recipientEmail: true,
            expiresAt: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
      take: 24,
    }),
    prisma.ticket.findMany({
      where: ticketWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    }),
  ]);

  const categoryOptions = Object.values(GalleryCategory);
  const visibilityOptions = Object.values(GalleryVisibility);
  const ticketStatusOptions = Object.values(TicketStatus);
  const shareLinkBase = env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  const r2PublicBase = env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? null;
  const mainCategoryOptions = Object.values(GalleryCategory).filter((category) => category !== GalleryCategory.CUSTOM);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Master Admin Panel</h1>
        <p className="text-sm text-neutral-700">
          Manage galleries, upload photos and ZIP archives, generate custom URLs, and process booking/connect tickets.
        </p>
      </header>

      {resolvedSearchParams.notice ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {noticeLabels[resolvedSearchParams.notice] ?? "Action completed."}
        </p>
      ) : null}

      {resolvedSearchParams.error ? (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorLabels[resolvedSearchParams.error] ?? "Action failed."}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-4">
        <article className="rounded border bg-white p-4">
          <h2 className="text-sm font-semibold">Active galleries</h2>
          <p className="mt-2 text-3xl font-semibold">{activeGalleriesCount}</p>
        </article>
        <article className="rounded border bg-white p-4">
          <h2 className="text-sm font-semibold">Pending tickets</h2>
          <p className="mt-2 text-3xl font-semibold">{pendingTicketsCount}</p>
        </article>
        <article className="rounded border bg-white p-4">
          <h2 className="text-sm font-semibold">Active custom links</h2>
          <p className="mt-2 text-3xl font-semibold">{activeLinksCount}</p>
        </article>
        <article className="rounded border bg-white p-4">
          <h2 className="text-sm font-semibold">Editable pages</h2>
          <p className="mt-2 text-3xl font-semibold">{siteContentEntries.length}</p>
        </article>
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
          initialCategory={createCategoryFilter}
          mainCategoryOptions={mainCategoryOptions}
          visibilityOptions={visibilityOptions}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Galleries</h2>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <input type="hidden" name="ticketQ" value={ticketQuery} />
            <input type="hidden" name="ticketStatus" value={ticketStatusFilter} />
            <input type="hidden" name="createCategory" value={createCategoryFilter} />
            <input
              className="rounded border px-3 py-1.5 text-xs"
              name="galleryQ"
              defaultValue={galleryQuery}
              placeholder="Search galleries..."
            />
            <button className="rounded border bg-white px-3 py-1.5 text-xs font-medium" type="submit">
              Filter
            </button>
          </form>
        </div>

        {galleries.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-700">
            No galleries match the current filter.
          </p>
        ) : (
          galleries.map((gallery) => (
            <article key={gallery.id} className="rounded border bg-white p-5">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-3 lg:col-span-2">
                  <form className="grid gap-2" action="/admin/actions/galleries/update" method="post">
                    <input type="hidden" name="id" value={gallery.id} />
                    <input className="rounded border px-3 py-2 text-sm" name="title" defaultValue={gallery.title} required />
                    <input className="rounded border px-3 py-2 text-sm" name="slug" defaultValue={gallery.slug} required />
                    <select className="rounded border px-3 py-2 text-sm" name="category" defaultValue={gallery.category}>
                      {categoryOptions.map((option) => (
                        <option key={option} value={option}>
                          {categoryLabels[option]}
                        </option>
                      ))}
                    </select>
                    <select className="rounded border px-3 py-2 text-sm" name="visibility" defaultValue={gallery.visibility}>
                      {visibilityOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <textarea
                      className="rounded border px-3 py-2 text-sm"
                      name="description"
                      defaultValue={gallery.description ?? ""}
                      rows={3}
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-neutral-700">
                      <input type="checkbox" name="isActive" defaultChecked={gallery.isActive} /> Active
                    </label>
                    <button className="rounded border px-3 py-1.5 text-xs font-medium" type="submit">
                      Save changes
                    </button>
                  </form>

                  <AdminAssetManager galleryId={gallery.id} assets={gallery.assets} r2PublicBase={r2PublicBase} />

                  <form action="/admin/actions/galleries/delete" method="post">
                    <input type="hidden" name="id" value={gallery.id} />
                    <button className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700" type="submit">
                      Delete gallery
                    </button>
                  </form>
                </div>

                <div className="space-y-3">
                  <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                    <p>Assets: {gallery._count.assets}</p>
                    <p>Custom links: {gallery._count.shareLinks}</p>
                    <p>Archive: {gallery.archiveFilename ?? "none"}</p>
                  </div>

                  <AdminArchiveUpload galleryId={gallery.id} currentArchiveFilename={gallery.archiveFilename} />

                  <form action="/admin/actions/galleries/archive-delete" method="post">
                    <input type="hidden" name="galleryId" value={gallery.id} />
                    <button className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700" type="submit">
                      Delete ZIP archive
                    </button>
                  </form>

                  <form className="grid gap-2" action="/admin/actions/galleries/share-link" method="post">
                    <input type="hidden" name="galleryId" value={gallery.id} />
                    <input className="rounded border px-3 py-2 text-xs" name="customSlug" placeholder="custom-slug (optional)" />
                    <input className="rounded border px-3 py-2 text-xs" name="password" placeholder="Password (optional)" />
                    <input className="rounded border px-3 py-2 text-xs" name="recipientEmail" placeholder="client@email.com" type="email" />
                    <input className="rounded border px-3 py-2 text-xs" name="expiresAt" type="datetime-local" />
                    <label className="inline-flex items-center gap-2 text-xs text-neutral-700">
                      <input name="sendEmail" type="checkbox" /> Send link via email
                    </label>
                    <button className="rounded border px-3 py-1.5 text-xs font-medium" type="submit">
                      Generate custom URL
                    </button>
                  </form>
                </div>
              </div>

              {gallery.shareLinks.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="border-b text-neutral-600">
                        <th className="px-2 py-1">Slug</th>
                        <th className="px-2 py-1">Recipient</th>
                        <th className="px-2 py-1">Expires</th>
                        <th className="px-2 py-1">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gallery.shareLinks.map((link) => (
                        <tr key={link.id} className="border-b">
                          <td className="px-2 py-1 font-medium">
                            {shareLinkBase ? (
                              <a className="underline" href={`${shareLinkBase}/g/${link.slug}`} target="_blank" rel="noreferrer">
                                /g/{link.slug}
                              </a>
                            ) : (
                              `/g/${link.slug}`
                            )}
                          </td>
                          <td className="px-2 py-1">{link.recipientEmail ?? "-"}</td>
                          <td className="px-2 py-1">{link.expiresAt ? link.expiresAt.toLocaleString() : "-"}</td>
                          <td className="px-2 py-1">{link.isActive ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Tickets</h2>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <input type="hidden" name="galleryQ" value={galleryQuery} />
            <input type="hidden" name="createCategory" value={createCategoryFilter} />
            <input className="rounded border px-3 py-1.5 text-xs" name="ticketQ" defaultValue={ticketQuery} placeholder="Search tickets" />
            <select className="rounded border px-3 py-1.5 text-xs" name="ticketStatus" defaultValue={ticketStatusFilter}>
              <option value="ALL">ALL</option>
              {ticketStatusOptions.map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {statusOption}
                </option>
              ))}
            </select>
            <button className="rounded border bg-white px-3 py-1.5 text-xs font-medium" type="submit">
              Filter
            </button>
          </form>
        </div>

        {tickets.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-700">
            No booking/connect tickets match the current filter.
          </p>
        ) : (
          tickets.map((ticket) => (
            <article key={ticket.id} className="rounded border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-600">
                    {ticket.type} - {ticket.source}
                  </p>
                  <h3 className="text-lg font-semibold">
                    {ticket.firstName} {ticket.lastName}
                  </h3>
                  <p className="text-sm text-neutral-700">{ticket.email}</p>
                  {ticket.telephone ? <p className="text-sm text-neutral-700">Telephone: {ticket.telephone}</p> : null}
                  {ticket.whatsapp ? <p className="text-sm text-neutral-700">WhatsApp: {ticket.whatsapp}</p> : null}
                  {ticket.eventDate ? <p className="text-sm text-neutral-700">Event date: {ticket.eventDate.toDateString()}</p> : null}
                  {ticket.eventType ? <p className="text-sm text-neutral-700">Event type: {ticket.eventType}</p> : null}
                  {ticket.eventDuration ? <p className="text-sm text-neutral-700">Event duration: {ticket.eventDuration}</p> : null}
                  {ticket.guestCount ? <p className="text-sm text-neutral-700">Guests: {ticket.guestCount}</p> : null}
                  {ticket.additionalNotes ? <p className="mt-2 text-sm text-neutral-700">Notes: {ticket.additionalNotes}</p> : null}
                  {ticket.message ? <p className="mt-2 text-sm text-neutral-700">Message: {ticket.message}</p> : null}
                </div>

                <div className="w-full max-w-sm space-y-3">
                  <form className="grid gap-2" action="/admin/actions/tickets/status" method="post">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <select className="rounded border px-3 py-2 text-xs" name="status" defaultValue={ticket.status}>
                      {ticketStatusOptions.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {statusOption}
                        </option>
                      ))}
                    </select>
                    <button className="rounded border px-3 py-1.5 text-xs font-medium" type="submit">
                      Update status
                    </button>
                  </form>

                  <form className="grid gap-2" action="/admin/actions/tickets/reply" method="post">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input
                      className="rounded border px-3 py-2 text-xs"
                      name="subject"
                      defaultValue={`Re: ${ticket.type.toLowerCase()} request`}
                      required
                    />
                    <textarea
                      className="rounded border px-3 py-2 text-xs"
                      name="message"
                      rows={4}
                      placeholder="Write your response..."
                      required
                    />
                    <button className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white" type="submit">
                      Send response
                    </button>
                  </form>
                </div>
              </div>

              {ticket.messages.length > 0 ? (
                <div className="mt-3 space-y-2 rounded border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-700">Response thread</p>
                  {ticket.messages.map((message) => (
                    <article key={message.id} className="rounded border bg-white p-2 text-xs">
                      <p className="font-medium text-neutral-800">
                        {message.actorType} - {message.createdAt.toLocaleString()}
                      </p>
                      {message.emailSubject ? <p className="mt-1 text-neutral-700">Subject: {message.emailSubject}</p> : null}
                      {message.bodyText ? (
                        <p className="mt-1 whitespace-pre-line text-neutral-700">{message.bodyText}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>

      <div className="flex items-center gap-4">
        <form action="/api/admin/logout" method="post">
          <button className="rounded border bg-white px-4 py-2 text-sm" type="submit">
            Sign out
          </button>
        </form>

        <Link className="text-sm underline" href="/">
          Back to website
        </Link>
      </div>
    </main>
  );
}


