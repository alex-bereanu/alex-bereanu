import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";

const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type AdminAuthProvider = "google" | "password";

export type AdminSession = {
  id: string;
  subject: string;
  provider: string;
  expiresAt: Date;
};

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isCurrentGoogleAdminSubjectAllowed(subject: string): boolean {
  const prefix = "google:";
  const subjectSeparator = subject.indexOf(":", prefix.length);

  if (!subject.startsWith(prefix) || subjectSeparator === -1) {
    return false;
  }

  const email = subject.slice(subjectSeparator + 1).trim().toLowerCase();
  const allowedEmails = (env.ADMIN_GOOGLE_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((allowedEmail) => allowedEmail.trim().toLowerCase())
    .filter(Boolean);

  return allowedEmails.includes(email);
}

async function isSessionPrincipalActive(session: { provider: string; subject: string }): Promise<boolean> {
  if (session.provider === "google") {
    return isCurrentGoogleAdminSubjectAllowed(session.subject);
  }

  if (session.provider === "password" && session.subject.startsWith("admin:")) {
    const adminUserId = session.subject.slice("admin:".length);
    return Boolean(await prisma.adminUser.findUnique({ where: { id: adminUserId }, select: { id: true } }));
  }

  return false;
}

export function getAdminSessionCookieName(): string {
  return env.NODE_ENV === "production" ? "__Host-admin_session" : "admin_session";
}

export function getAdminSessionMaxAgeSeconds(): number {
  return ADMIN_SESSION_MAX_AGE_SECONDS;
}

export function getAdminAuthMode(): "google" | "password" | "both" {
  return env.ADMIN_AUTH_MODE ?? (env.NODE_ENV === "production" ? "google" : "both");
}

export function isPasswordAdminLoginEnabled(): boolean {
  const mode = getAdminAuthMode();
  return mode === "password" || mode === "both";
}

export async function createAdminSessionToken(
  subject: string,
  provider: AdminAuthProvider = "password",
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.adminSession.create({
    data: {
      tokenHash: hashSessionToken(token),
      subject,
      provider,
      expiresAt,
    },
  });

  return token;
}

export async function verifyAdminSessionToken(token: string): Promise<AdminSession | null> {
  if (!env.DATABASE_URL || token.length < 32) {
    return null;
  }

  try {
    const session = await prisma.adminSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: {
        id: true,
        subject: true,
        provider: true,
        expiresAt: true,
        revokedAt: true,
        lastSeenAt: true,
      },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    if (!(await isSessionPrincipalActive(session))) {
      await prisma.adminSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return null;
    }

    if (Date.now() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
      await prisma.adminSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
        },
        data: { lastSeenAt: new Date() },
      });
    }

    return {
      id: session.id,
      subject: session.subject,
      provider: session.provider,
      expiresAt: session.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function revokeAdminSessionToken(token: string | null | undefined): Promise<void> {
  if (!env.DATABASE_URL || !token) {
    return;
  }

  await prisma.adminSession.updateMany({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

export function isAdminSessionConfigured(): boolean {
  return Boolean(env.DATABASE_URL);
}

export function isAdminAuthConfigured(): boolean {
  return isAdminSessionConfigured();
}
