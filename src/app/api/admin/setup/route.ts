import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  createAdminSessionToken,
  getAdminSessionCookieName,
  getAdminSessionMaxAgeSeconds,
  isAdminSessionConfigured,
} from "@/server/auth/admin-session";
import { getSecureCookieOptions } from "@/server/auth/cookies";
import { verifyMutationProtection } from "@/server/security/request-protection";
import { checkRateLimit, getClientIp, rateLimitJsonResponse } from "@/server/security/rate-limit";
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
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password must be at most 128 characters."),
    confirmPassword: z.string().min(1, "Please confirm the password."),
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
  const setupRateLimit = await checkRateLimit({
    key: `admin-setup:${getClientIp(request)}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

  if (!setupRateLimit.allowed) {
    return rateLimitJsonResponse("Too many setup attempts. Please try again later.", setupRateLimit.retryAfterSeconds);
  }

  if (!env.DATABASE_URL) {
    return NextResponse.json({ error: "Admin setup requires DATABASE_URL." }, { status: 500 });
  }

  if (!isAdminSessionConfigured()) {
    return NextResponse.json({ error: "Admin setup requires ADMIN_SESSION_SECRET." }, { status: 503 });
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
    );

    if (turnstileError) {
      return turnstileError;
    }

    const parsed = setupSchema.parse(body);
    const username = parsed.username.toLowerCase();

    const existingAdmin = await prisma.adminUser.findFirst({
      select: { id: true },
    });

    if (existingAdmin) {
      return NextResponse.json({ error: "An admin account already exists. Please sign in." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);

    await prisma.adminUser.create({
      data: {
        username,
        passwordHash,
      },
    });

    const token = await createAdminSessionToken(username);
    const response = NextResponse.json({ ok: true }, { status: 201 });

    response.cookies.set({
      name: getAdminSessionCookieName(),
      value: token,
      ...getSecureCookieOptions(getAdminSessionMaxAgeSeconds()),
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
