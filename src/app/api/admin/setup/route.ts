import { timingSafeEqual } from "node:crypto";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  createAdminSessionToken,
  getAdminSessionCookieName,
  getAdminSessionMaxAgeSeconds,
  isPasswordAdminLoginEnabled,
  isAdminSessionConfigured,
} from "@/server/auth/admin-session";
import { getSecureCookieOptions } from "@/server/auth/cookies";
import { recordSecurityAuditEvent } from "@/server/security/audit";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { buildRateLimitKey, checkRateLimit, getClientIp, rateLimitJsonResponse } from "@/server/security/rate-limit";
import { verifyTurnstileToken } from "@/server/security/turnstile";

const setupSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters.")
      .max(64, "Username must be at most 64 characters.")
      .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, underscores, or dashes only."),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters.")
      .max(128, "Password must be at most 128 characters."),
    confirmPassword: z.string().min(1, "Please confirm the password."),
    setupToken: z.string().min(32, "A valid setup token is required."),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export async function POST(request: Request): Promise<NextResponse> {
  const clientIp = getClientIp(request);
  const setupRateLimit = await checkRateLimit({
    key: buildRateLimitKey("admin-setup", request),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

  if (!setupRateLimit.allowed) {
    await recordSecurityAuditEvent({ eventType: "admin.setup", outcome: "DENIED", clientIp, metadata: { reason: "rate_limited" } });
    return rateLimitJsonResponse("Too many setup attempts. Please try again later.", setupRateLimit.retryAfterSeconds);
  }

  if (!env.DATABASE_URL) {
    return NextResponse.json({ error: "Admin setup requires DATABASE_URL." }, { status: 500 });
  }

  if (!isAdminSessionConfigured()) {
    return NextResponse.json({ error: "Admin setup requires database-backed sessions." }, { status: 503 });
  }

  if (!isPasswordAdminLoginEnabled() || !env.ADMIN_SETUP_TOKEN) {
    return NextResponse.json({ error: "Admin setup is disabled." }, { status: 404 });
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
      "admin_setup",
    );

    if (turnstileError) {
      return turnstileError;
    }

    const parsed = setupSchema.parse(body);
    const username = parsed.username.toLowerCase();

    const submittedSetupToken = Buffer.from(parsed.setupToken);
    const configuredSetupToken = Buffer.from(env.ADMIN_SETUP_TOKEN);

    if (
      submittedSetupToken.length !== configuredSetupToken.length ||
      !timingSafeEqual(submittedSetupToken, configuredSetupToken)
    ) {
      await recordSecurityAuditEvent({ eventType: "admin.setup", outcome: "DENIED", clientIp, metadata: { reason: "invalid_setup_token" } });
      return NextResponse.json({ error: "Invalid setup token." }, { status: 403 });
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);
    const adminUser = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(73194721)`;

      const existingAdmin = await transaction.adminUser.findFirst({
        select: { id: true },
      });

      if (existingAdmin) {
        return null;
      }

      return transaction.adminUser.create({
        data: {
          username,
          passwordHash,
        },
        select: { id: true },
      });
    });

    if (!adminUser) {
      return NextResponse.json({ error: "An admin account already exists. Please sign in." }, { status: 409 });
    }

    const token = await createAdminSessionToken(`admin:${adminUser.id}`, "password");
    const response = NextResponse.json({ ok: true }, { status: 201 });

    response.cookies.set({
      name: getAdminSessionCookieName(),
      value: token,
      ...getSecureCookieOptions(getAdminSessionMaxAgeSeconds()),
    });

    await recordSecurityAuditEvent({
      eventType: "admin.setup",
      outcome: "SUCCESS",
      actor: `admin:${adminUser.id}`,
      clientIp,
      metadata: { provider: "password" },
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid setup payload.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    console.error("Unable to create admin account.", error);
    return NextResponse.json({ error: "Unable to create admin account." }, { status: 500 });
  }
}
