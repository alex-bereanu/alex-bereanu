import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { requireAdminRequestSession } from "@/server/auth/admin-guard";
import { createGalleryShareCapability } from "@/server/auth/gallery-access";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";
import { isAdminClientDeliveryPhase4Enabled } from "@/server/services/admin-client-delivery-phase4";
import { getClientIp } from "@/server/security/rate-limit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { buildShareLinkTemplate } from "@/server/services/email-templates";
import { isMailerConfigured, sendTransactionalEmail } from "@/server/services/mailer";

const DEFAULT_SHARE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

const shareLinkSchema = z.object({
  galleryId: z.string().trim().min(1),
  password: z.string().min(12).max(200).optional(),
  recipientEmail: z.string().trim().email().optional(),
  expiresAt: z.string().optional(),
  maxDownloads: z.number().int().positive().max(10_000).optional(),
  sendEmail: z.boolean(),
  replacesShareLinkId: z.string().trim().min(1).optional(),
});

function redirectToAdmin(request: Request, query: string): NextResponse {
  const url = new URL(`/admin/galleries?view=expanded&${query}`, request.url);
  return NextResponse.redirect(url, 303);
}

function guessRecipientName(email: string): string {
  return email.split("@")[0] ?? "Client";
}

function wantsJson(request: Request): boolean {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authRedirect = await requireAdminRequestSession(request);
  if (authRedirect) {
    return authRedirect;
  }

  if (!env.DATABASE_URL) {
    return wantsJson(request)
      ? NextResponse.json({ error: "Database is not configured." }, { status: 503 })
      : redirectToAdmin(request, "error=database_not_configured");
  }

  try {
    const jsonMode = wantsJson(request);
    const payload = jsonMode ? await request.json() : Object.fromEntries(await request.formData());
    const securityError = verifyMutationProtection(
      request,
      typeof payload.csrfToken === "string" ? payload.csrfToken : null,
    );

    if (securityError) {
      return securityError;
    }

    const parsed = shareLinkSchema.parse({
      galleryId: payload.galleryId,
      password: typeof payload.password === "string" && payload.password ? payload.password : undefined,
      recipientEmail:
        typeof payload.recipientEmail === "string" && payload.recipientEmail.trim()
          ? payload.recipientEmail.trim()
          : undefined,
      expiresAt: typeof payload.expiresAt === "string" && payload.expiresAt ? payload.expiresAt : undefined,
      maxDownloads:
        typeof payload.maxDownloads === "number"
          ? payload.maxDownloads
          : typeof payload.maxDownloads === "string" && payload.maxDownloads
            ? Number(payload.maxDownloads)
            : undefined,
      sendEmail: payload.sendEmail === true || payload.sendEmail === "on",
      replacesShareLinkId:
        typeof payload.replacesShareLinkId === "string" && payload.replacesShareLinkId.trim()
          ? payload.replacesShareLinkId.trim()
          : undefined,
    });

    const phase4 = isAdminClientDeliveryPhase4Enabled();
    const gallery = await prisma.gallery.findFirst({
      where: {
        id: parsed.galleryId,
        ...(isAdminGalleryPhase2Enabled() ? { status: "PUBLISHED" as const } : { isActive: true }),
        visibility: "PRIVATE",
        ...(phase4 ? { clientDeliveryEnabled: true } : {}),
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (!gallery) {
      return jsonMode
        ? NextResponse.json({ error: phase4 ? "Enable client delivery for this published private gallery first." : "Only active private galleries can be shared." }, { status: 400 })
        : redirectToAdmin(request, "error=gallery_not_found");
    }

    const expiresAt = parsed.expiresAt
      ? new Date(parsed.expiresAt)
      : new Date(Date.now() + DEFAULT_SHARE_LIFETIME_MS);

    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return jsonMode
        ? NextResponse.json({ error: "Expiry must be a valid future date." }, { status: 400 })
        : redirectToAdmin(request, "error=invalid_share_link_payload");
    }

    const capability = createGalleryShareCapability();
    const passwordHash = parsed.password ? await bcrypt.hash(parsed.password, 12) : undefined;
    const shareLink = phase4
      ? await prisma.$transaction(async (transaction) => {
          const replacement = parsed.replacesShareLinkId
            ? await transaction.galleryShareLink.findFirst({
                where: { id: parsed.replacesShareLinkId, galleryId: gallery.id, isActive: true, tokenHash: { not: null } },
                select: { id: true },
              })
            : null;
          if (parsed.replacesShareLinkId && !replacement) throw new Error("replacement_link_not_found");
          const created = await transaction.galleryShareLink.create({
            data: {
              galleryId: gallery.id,
              slug: capability.internalLabel,
              tokenHash: capability.tokenHash,
              passwordHash,
              recipientEmail: parsed.recipientEmail,
              expiresAt,
            },
            select: { id: true },
          });
          if (replacement) {
            await transaction.galleryShareLink.update({
              where: { id: replacement.id },
              data: { isActive: false, revokedAt: new Date(), replacedAt: new Date(), replacedById: created.id, grantVersion: { increment: 1 } },
              select: { id: true },
            });
          }
          return created;
        })
      : await prisma.galleryShareLink.create({
          data: {
            galleryId: gallery.id,
            slug: capability.internalLabel,
            tokenHash: capability.tokenHash,
            passwordHash,
            recipientEmail: parsed.recipientEmail,
            expiresAt,
            maxDownloads: parsed.maxDownloads,
          },
          select: { id: true },
        });
    const origin = env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
    const galleryUrl = `${origin}/g/${capability.token}`;
    let emailStatus: "NOT_REQUESTED" | "SENT" | "SKIPPED" | "FAILED" = "NOT_REQUESTED";

    if (parsed.sendEmail && parsed.recipientEmail) {
      const template = buildShareLinkTemplate({
        recipientName: guessRecipientName(parsed.recipientEmail),
        galleryTitle: gallery.title,
        galleryUrl,
        // Passwords must be delivered through a separate channel.
        password: undefined,
        expiresAt,
      });

      if (isMailerConfigured()) {
        try {
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
              metadata: { shareLinkId: shareLink.id },
            },
          });
          emailStatus = "SENT";
        } catch {
          emailStatus = "FAILED";
          await prisma.emailLog
            .create({
              data: {
                templateKey: "gallery-share-link",
                toEmail: parsed.recipientEmail,
                subject: `Your gallery link: ${gallery.title}`,
                status: "FAILED",
                metadata: { shareLinkId: shareLink.id },
              },
            })
            .catch(() => undefined);
        }
      } else {
        await prisma.emailLog.create({
          data: {
            templateKey: "gallery-share-link",
            toEmail: parsed.recipientEmail,
            subject: `Your gallery link: ${gallery.title}`,
            status: "SKIPPED_MAILER_NOT_CONFIGURED",
            metadata: { shareLinkId: shareLink.id },
          },
        });
        emailStatus = "SKIPPED";
      }
    }

    await recordSecurityAuditEvent({
      eventType: "gallery.share.create",
      outcome: "SUCCESS",
      clientIp: getClientIp(request),
      resourceType: "share_link",
      resourceId: shareLink.id,
      metadata: {
        gallery_id: gallery.id,
        password_protected: Boolean(parsed.password),
        email_status: emailStatus,
        replaced_link: Boolean(parsed.replacesShareLinkId),
      },
    });

    return jsonMode
      ? NextResponse.json({
          ok: true,
          shareLinkId: shareLink.id,
          galleryUrl,
          expiresAt: expiresAt.toISOString(),
          emailStatus,
          passwordMustBeSharedSeparately: Boolean(parsed.password && parsed.sendEmail),
          replacedExistingLink: Boolean(parsed.replacesShareLinkId),
        })
      : redirectToAdmin(request, "notice=share_link_created");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return wantsJson(request)
        ? NextResponse.json({ error: "Invalid share-link payload.", issues: error.issues }, { status: 400 })
        : redirectToAdmin(request, "error=invalid_share_link_payload");
    }

    return wantsJson(request)
      ? NextResponse.json({ error: "Unable to create share link." }, { status: 500 })
      : redirectToAdmin(request, "error=share_link_create_failed");
  }
}
