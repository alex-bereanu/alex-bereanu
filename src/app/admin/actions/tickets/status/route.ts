import { TicketStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";

const statusSchema = z.object({
  ticketId: z.string().trim().min(1),
  status: z.nativeEnum(TicketStatus),
});

function redirectToAdmin(request: Request, query: string): NextResponse {
  const url = new URL(`/admin?${query}`, request.url);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (!env.DATABASE_URL) {
    return redirectToAdmin(request, "error=database_not_configured");
  }

  try {
    const formData = await request.formData();
    const parsed = statusSchema.parse({
      ticketId: formData.get("ticketId"),
      status: formData.get("status"),
    });

    await prisma.ticket.update({
      where: { id: parsed.ticketId },
      data: {
        status: parsed.status,
      },
    });

    return redirectToAdmin(request, "notice=ticket_status_updated");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToAdmin(request, "error=invalid_ticket_status_payload");
    }

    return redirectToAdmin(request, "error=ticket_status_update_failed");
  }
}
