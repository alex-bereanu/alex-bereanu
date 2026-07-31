import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { contactSchema } from "@/lib/validators/forms";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { buildRateLimitKey, checkRateLimit, rateLimitJsonResponse } from "@/server/security/rate-limit";
import { verifyTurnstileToken } from "@/server/security/turnstile";
import { sendAdminNotification } from "@/server/services/mailer";

export async function POST(request: Request): Promise<NextResponse> {
  const contactRateLimit = await checkRateLimit({
    key: buildRateLimitKey("contact", request),
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!contactRateLimit.allowed) {
    return rateLimitJsonResponse("Too many connect requests. Please try again later.", contactRateLimit.retryAfterSeconds);
  }

  if (!env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Server is missing DATABASE_URL configuration." },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const securityError = verifyMutationProtection(request, typeof body?.csrfToken === "string" ? body.csrfToken : null);

    if (securityError) {
      return securityError;
    }

    const turnstileError = await verifyTurnstileToken(
      request,
      typeof body?.turnstileToken === "string" ? body.turnstileToken : null,
      "contact",
    );

    if (turnstileError) {
      return turnstileError;
    }

    const input = contactSchema.parse(body);

    const ticket = await prisma.ticket.create({
      data: {
        type: "CONTACT",
        source: "HOMEPAGE_CONTACT",
        status: "NEW",
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        telephone: input.telephone,
        message: input.message,
      },
      select: {
        id: true,
      },
    });

    try {
      await sendAdminNotification({
        subject: `New connect message: ${input.firstName} ${input.lastName}`,
        text: [
          `Ticket ID: ${ticket.id}`,
          `Email: ${input.email}`,
          `Telephone: ${input.telephone}`,
          "",
          input.message,
        ].join("\n"),
      });
    } catch (notificationError) {
      console.error("Unable to send connect admin notification.", notificationError);
    }

    return NextResponse.json({
      ok: true,
      ticketId: ticket.id,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid connect form payload.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Unable to process connect request." }, { status: 500 });
  }
}
