import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { bookingSchema } from "@/lib/validators/forms";
import { checkRateLimit, getClientIp, rateLimitJsonResponse } from "@/server/security/rate-limit";
import { sendAdminNotification } from "@/server/services/mailer";

export async function POST(request: Request): Promise<NextResponse> {
  const bookingRateLimit = checkRateLimit({
    key: `booking:${getClientIp(request)}`,
    limit: 4,
    windowMs: 30 * 60 * 1000,
  });

  if (!bookingRateLimit.allowed) {
    return rateLimitJsonResponse("Too many booking requests. Please try again later.", bookingRateLimit.retryAfterSeconds);
  }

  if (!env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Server is missing DATABASE_URL configuration." },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const input = bookingSchema.parse(body);

    const ticket = await prisma.ticket.create({
      data: {
        type: "BOOKING",
        source: "HOMEPAGE_BOOKINGS",
        status: "NEW",
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        whatsapp: input.whatsapp,
        eventDate: new Date(input.eventDate),
        eventType: input.eventType,
        eventDuration: input.eventDuration,
        guestCount: input.approximateGuestCount,
        additionalNotes: input.additionalNotes,
      },
      select: {
        id: true,
      },
    });

    try {
      await sendAdminNotification({
        subject: `New booking request: ${input.firstName} ${input.lastName}`,
        text: [
          `Ticket ID: ${ticket.id}`,
          `Email: ${input.email}`,
          `WhatsApp: ${input.whatsapp}`,
          `Event date: ${input.eventDate}`,
          `Event type: ${input.eventType}`,
          `Duration: ${input.eventDuration}`,
          `Guests: ${input.approximateGuestCount}`,
          `Notes: ${input.additionalNotes ?? "-"}`,
        ].join("\n"),
      });
    } catch (notificationError) {
      console.error("Unable to send booking admin notification.", notificationError);
    }

    return NextResponse.json({
      ok: true,
      ticketId: ticket.id,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid booking form payload.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Unable to process booking request." }, { status: 500 });
  }
}
