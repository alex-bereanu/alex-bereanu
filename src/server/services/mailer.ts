import { Resend } from "resend";

import { env } from "@/config/env";

type AdminNotificationInput = {
  subject: string;
  text: string;
};

type TransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type TransactionalEmailResult = {
  id?: string;
};

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }

  return resendClient;
}

export function isMailerConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult | null> {
  const client = getResendClient();

  if (!client || !env.RESEND_FROM_EMAIL) {
    return null;
  }

  const response = await client.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return {
    id: response.data?.id,
  };
}

export async function sendAdminNotification(input: AdminNotificationInput): Promise<void> {
  if (!env.ADMIN_NOTIFICATION_EMAIL) {
    return;
  }

  await sendTransactionalEmail({
    to: env.ADMIN_NOTIFICATION_EMAIL,
    subject: input.subject,
    text: input.text,
  });
}
