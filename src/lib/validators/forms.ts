import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const bookingSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  whatsapp: z.string().trim().min(5).max(40),
  eventDate: z.string().regex(dateRegex, "Use YYYY-MM-DD format"),
  eventType: z.string().trim().min(2).max(120),
  eventDuration: z.string().trim().min(1).max(80),
  approximateGuestCount: z.coerce.number().int().min(1).max(100000),
  additionalNotes: z.string().trim().max(4000).optional(),
});

export const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  telephone: z.string().trim().min(5).max(40),
  message: z
    .string()
    .trim()
    .min(5, "Your message is too short. Please share at least 5 characters.")
    .max(4000),
});

export type BookingInput = z.infer<typeof bookingSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
