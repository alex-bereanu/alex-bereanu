import { TicketStatus } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSessionDetails } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";

const statusSchema = z.object({
  ticketId: z.string().trim().min(1),
  status: z.nativeEnum(TicketStatus),
});

function redirectToAdmin(request: Request, query: string): NextResponse {
  const url = new URL(`/admin/tickets?${query}`, request.url);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAdminRequestSessionDetails(request);
  if (auth.response) return auth.response;
  const clientIp = getClientIp(request);

  if (!env.DATABASE_URL) {
    return redirectToAdmin(request, "error=database_not_configured");
  }

  try {
    const formData = await request.formData();
    const securityError = verifyMutationProtection(request, String(formData.get("csrfToken") ?? ""));

    if (securityError) {
      return securityError;
    }

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
    await recordSecurityAuditEvent({ eventType: "ticket.status.update", outcome: "SUCCESS", actor: auth.session.subject, clientIp, resourceType: "ticket", resourceId: parsed.ticketId, metadata: { status: parsed.status } });

    return redirectToAdmin(request, "notice=ticket_status_updated");
  } catch (error) {
    if (error instanceof z.ZodError) {
      await recordSecurityAuditEvent({ eventType: "ticket.status.update", outcome: "DENIED", actor: auth.session.subject, clientIp, metadata: { reason: "invalid_payload" } });
      return redirectToAdmin(request, "error=invalid_ticket_status_payload");
    }

    await recordSecurityAuditEvent({ eventType: "ticket.status.update", outcome: "ERROR", actor: auth.session.subject, clientIp, metadata: { reason: error instanceof Error ? error.name : "UnknownError" } });
    return redirectToAdmin(request, "error=ticket_status_update_failed");
  }
}
