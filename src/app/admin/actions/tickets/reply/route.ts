import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { buildTicketReplyTemplate } from "@/server/services/email-templates";
import { isMailerConfigured, sendTransactionalEmail } from "@/server/services/mailer";
import { requireAdminRequestSessionDetails } from "@/server/auth/admin-guard";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";

const replySchema = z.object({
  ticketId: z.string().trim().min(1),
  subject: z.string().trim().min(3).max(180),
  message: z.string().trim().min(5).max(5000),
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

    const parsed = replySchema.parse({
      ticketId: formData.get("ticketId"),
      subject: formData.get("subject"),
      message: formData.get("message"),
    });

    const ticket = await prisma.ticket.findUnique({
      where: { id: parsed.ticketId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!ticket) {
      return redirectToAdmin(request, "error=ticket_not_found");
    }

    const template = buildTicketReplyTemplate({
      recipientName: `${ticket.firstName} ${ticket.lastName}`.trim(),
      message: parsed.message,
    });

    let emailProviderId: string | undefined;
    let emailStatus = "SKIPPED_MAILER_NOT_CONFIGURED";

    if (isMailerConfigured()) {
      const result = await sendTransactionalEmail({
        to: ticket.email,
        subject: parsed.subject,
        text: template.text,
        html: template.html,
      });
      emailProviderId = result?.id;
      emailStatus = "SENT";
    }

    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "RESPONDED",
        },
      }),
      prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          actorType: "ADMIN",
          actorLabel: "Admin",
          emailTo: ticket.email,
          emailSubject: parsed.subject,
          bodyText: template.text,
          bodyHtml: template.html,
        },
      }),
      prisma.emailLog.create({
        data: {
          templateKey: "ticket-reply",
          toEmail: ticket.email,
          subject: parsed.subject,
          providerMessageId: emailProviderId,
          status: emailStatus,
          metadata: {
            ticketId: ticket.id,
          },
        },
      }),
    ]);
    await recordSecurityAuditEvent({ eventType: "ticket.reply", outcome: "SUCCESS", actor: auth.session.subject, clientIp, resourceType: "ticket", resourceId: ticket.id, metadata: { email_status: emailStatus } });

    return redirectToAdmin(request, "notice=ticket_reply_sent");
  } catch (error) {
    if (error instanceof z.ZodError) {
      await recordSecurityAuditEvent({ eventType: "ticket.reply", outcome: "DENIED", actor: auth.session.subject, clientIp, metadata: { reason: "invalid_payload" } });
      return redirectToAdmin(request, "error=invalid_ticket_reply_payload");
    }

    await recordSecurityAuditEvent({ eventType: "ticket.reply", outcome: "ERROR", actor: auth.session.subject, clientIp, metadata: { reason: error instanceof Error ? error.name : "UnknownError" } });
    return redirectToAdmin(request, "error=ticket_reply_failed");
  }
}
