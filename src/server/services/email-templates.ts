import { env } from "@/config/env";

type TicketReplyTemplateInput = {
  recipientName: string;
  message: string;
};

type ShareLinkTemplateInput = {
  recipientName: string;
  galleryTitle: string;
  galleryUrl: string;
  password?: string;
  expiresAt?: Date;
};

export function buildTicketReplyTemplate(input: TicketReplyTemplateInput): {
  text: string;
  html: string;
} {
  const greeting = input.recipientName.trim() ? `Hello ${input.recipientName},` : "Hello,";

  const text = [greeting, "", input.message.trim(), "", "Best regards,", env.NEXT_PUBLIC_SITE_NAME ?? "Photography Studio"].join(
    "\n",
  );

  const html = [
    `<p>${greeting}</p>`,
    `<p>${escapeHtml(input.message).replace(/\n/g, "<br />")}</p>`,
    `<p>Best regards,<br />${escapeHtml(env.NEXT_PUBLIC_SITE_NAME ?? "Photography Studio")}</p>`,
  ].join("");

  return { text, html };
}

export function buildShareLinkTemplate(input: ShareLinkTemplateInput): {
  text: string;
  html: string;
} {
  const greeting = input.recipientName.trim() ? `Hello ${input.recipientName},` : "Hello,";
  const expiresLine = input.expiresAt ? `This gallery link expires on ${input.expiresAt.toUTCString()}.` : "";
  const passwordLine = input.password ? `Password: ${input.password}` : "No password is required for this gallery.";

  const textLines = [
    greeting,
    "",
    `Your gallery is ready: ${input.galleryTitle}`,
    `Access link: ${input.galleryUrl}`,
    passwordLine,
    expiresLine,
    "",
    "If you have any issues accessing files, reply to this email.",
    "",
    `- ${env.NEXT_PUBLIC_SITE_NAME ?? "Photography Studio"}`,
  ].filter(Boolean);

  const html = [
    `<p>${greeting}</p>`,
    `<p>Your gallery is ready: <strong>${escapeHtml(input.galleryTitle)}</strong></p>`,
    `<p>Access link: <a href="${escapeHtml(input.galleryUrl)}">${escapeHtml(input.galleryUrl)}</a></p>`,
    `<p>${escapeHtml(passwordLine)}</p>`,
    expiresLine ? `<p>${escapeHtml(expiresLine)}</p>` : "",
    "<p>If you have any issues accessing files, reply to this email.</p>",
    `<p>- ${escapeHtml(env.NEXT_PUBLIC_SITE_NAME ?? "Photography Studio")}</p>`,
  ]
    .filter(Boolean)
    .join("");

  return { text: textLines.join("\n"), html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
