import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { toSlug, withRandomSuffix } from "@/lib/slug";
import { buildShareLinkTemplate } from "@/server/services/email-templates";
import { isMailerConfigured, sendTransactionalEmail } from "@/server/services/mailer";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";

const shareLinkSchema = z.object({
  galleryId: z.string().trim().min(1),
  customSlug: z.string().trim().max(200).optional(),
  password: z.string().max(200).optional(),
  recipientEmail: z.string().trim().email().optional(),
  expiresAt: z.string().optional(),
  sendEmail: z.boolean(),
});

function redirectToAdmin(request: Request, query: string): NextResponse {
  const url = new URL(`/admin?${query}`, request.url);
  return NextResponse.redirect(url, 303);
}

function guessRecipientName(email: string): string {
  return email.split("@")[0] ?? "Client";
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

    const parsed = shareLinkSchema.parse({
      galleryId: formData.get("galleryId"),
      customSlug: String(formData.get("customSlug") ?? "").trim() || undefined,
      password: String(formData.get("password") ?? "").trim() || undefined,
      recipientEmail: String(formData.get("recipientEmail") ?? "").trim() || undefined,
      expiresAt: String(formData.get("expiresAt") ?? "").trim() || undefined,
      sendEmail: String(formData.get("sendEmail") ?? "") === "on",
    });

    const gallery = await prisma.gallery.findUnique({
      where: { id: parsed.galleryId },
      select: {
        id: true,
        title: true,
      },
    });

    if (!gallery) {
      return redirectToAdmin(request, "error=gallery_not_found");
    }

    const resolvedSlug = parsed.customSlug ? toSlug(parsed.customSlug) : withRandomSuffix(toSlug(gallery.title) || "gallery");

    const passwordHash = parsed.password ? await bcrypt.hash(parsed.password, 10) : undefined;
    const expiresAt = parsed.expiresAt ? new Date(parsed.expiresAt) : undefined;

    const shareLink = await prisma.galleryShareLink.create({
      data: {
        galleryId: gallery.id,
        slug: resolvedSlug,
        passwordHash,
        recipientEmail: parsed.recipientEmail,
        expiresAt,
      },
      select: {
        id: true,
        slug: true,
      },
    });

    if (parsed.sendEmail && parsed.recipientEmail) {
      const origin = env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
      const galleryUrl = `${origin}/g/${shareLink.slug}`;
      const template = buildShareLinkTemplate({
        recipientName: guessRecipientName(parsed.recipientEmail),
        galleryTitle: gallery.title,
        galleryUrl,
        password: parsed.password,
        expiresAt,
      });

      if (isMailerConfigured()) {
        const result = await sendTransactionalEmail({
          to: parsed.recipientEmail,
          subject: `Your gallery link: ${gallery.title}`,
          text: template.text,
          html: template.html,
        });

        await prisma.emailLog.create({
          data: {
            templateKey: "gallery-share-link",
            toEmail: parsed.recipientEmail,
            subject: `Your gallery link: ${gallery.title}`,
            providerMessageId: result?.id,
            status: "SENT",
            metadata: {
              shareLinkId: shareLink.id,
              slug: shareLink.slug,
            },
          },
        });
      } else {
        await prisma.emailLog.create({
          data: {
            templateKey: "gallery-share-link",
            toEmail: parsed.recipientEmail,
            subject: `Your gallery link: ${gallery.title}`,
            status: "SKIPPED_MAILER_NOT_CONFIGURED",
            metadata: {
              shareLinkId: shareLink.id,
              slug: shareLink.slug,
            },
          },
        });
      }
    }

    return redirectToAdmin(request, "notice=share_link_created");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return redirectToAdmin(request, "error=invalid_share_link_payload");
    }

    return redirectToAdmin(request, "error=share_link_create_failed");
  }
}
