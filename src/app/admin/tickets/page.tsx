import { Prisma, TicketStatus } from "@/generated/prisma/client";

import { AdminAlerts, AdminFooter, AdminNav } from "@/app/admin/_components/admin-chrome";
import { resolveTicketStatusFilter } from "@/app/admin/_lib/admin-options";
import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { createCsrfToken } from "@/server/security/request-protection";

type AdminTicketsPageProps = {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    ticketQ?: string;
    ticketStatus?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage({ searchParams }: AdminTicketsPageProps) {
  await requireAdminPageSession("/admin/tickets");
  const resolvedSearchParams = await searchParams;
  const csrfToken = createCsrfToken();

  if (!env.DATABASE_URL) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <h1 className="text-3xl font-semibold">Tickets</h1>
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          DATABASE_URL is not configured. Set it in <code>.env.local</code> to enable ticket management.
        </p>
        <AdminFooter csrfToken={csrfToken} />
      </main>
    );
  }

  const ticketQuery = resolvedSearchParams.ticketQ?.trim() ?? "";
  const ticketStatusFilter = resolveTicketStatusFilter(resolvedSearchParams.ticketStatus);
  const ticketStatusOptions = Object.values(TicketStatus);

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

  const tickets = await prisma.ticket.findMany({
    where: ticketWhere,
    orderBy: { createdAt: "desc" },
    take: 75,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <header className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-neutral-500">Admin</p>
          <h1 className="text-3xl font-semibold">Tickets</h1>
          <p className="text-sm text-neutral-700">
            Review booking and contact requests, update their status, and send replies from one focused queue.
          </p>
        </div>
        <AdminNav active="tickets" />
      </header>

      <AdminAlerts error={resolvedSearchParams.error} notice={resolvedSearchParams.notice} />

      <section className="rounded border bg-white p-4">
        <form className="flex flex-wrap items-center gap-2" method="get">
          <input className="rounded border px-3 py-2 text-xs" name="ticketQ" defaultValue={ticketQuery} placeholder="Search tickets" />
          <select className="rounded border px-3 py-2 text-xs" name="ticketStatus" defaultValue={ticketStatusFilter}>
            <option value="ALL">ALL</option>
            {ticketStatusOptions.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {statusOption}
              </option>
            ))}
          </select>
          <button className="rounded border bg-white px-3 py-2 text-xs font-medium" type="submit">
            Filter
          </button>
        </form>
      </section>

      {tickets.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-700">
          No booking/connect tickets match the current filter.
        </p>
      ) : (
        <section className="space-y-4">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="rounded border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-600">
                    {ticket.type} - {ticket.source} - {ticket.status}
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
                    <input type="hidden" name="csrfToken" value={csrfToken} />
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
                    <input type="hidden" name="csrfToken" value={csrfToken} />
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
                      {message.bodyText ? <p className="mt-1 whitespace-pre-line text-neutral-700">{message.bodyText}</p> : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}

      <AdminFooter csrfToken={csrfToken} />
    </main>
  );
}
