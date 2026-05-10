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
  isAdminAuthConfigured,
  isAdminSessionConfigured,
} from "@/server/auth/admin-session";
import { getSecureCookieOptions } from "@/server/auth/cookies";
import { checkRateLimit, getClientIp, rateLimitJsonResponse } from "@/server/security/rate-limit";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function validateEnvPassword(password: string): Promise<boolean> {
  if (env.ADMIN_PASSWORD_HASH) {
    return bcrypt.compare(password, env.ADMIN_PASSWORD_HASH);
  }

  if (env.ADMIN_PASSWORD_PLAIN) {
    return secureCompare(password, env.ADMIN_PASSWORD_PLAIN);
  }

  return false;
}

async function validateDatabasePassword(username: string, password: string): Promise<boolean> {
  if (!env.DATABASE_URL) {
    return false;
  }

  try {
    const adminUser = await prisma.adminUser.findUnique({
      where: {
        username,
      },
      select: {
        passwordHash: true,
      },
    });

    if (!adminUser) {
      return false;
    }

    return bcrypt.compare(password, adminUser.passwordHash);
  } catch (error) {
    console.error("Unable to read admin users from database.", error);
    return false;
  }
}

async function hasDatabaseAdminUser(): Promise<boolean> {
  if (!env.DATABASE_URL) {
    return false;
  }

  try {
    const adminUser = await prisma.adminUser.findFirst({
      select: { id: true },
    });

    return Boolean(adminUser);
  } catch (error) {
    console.error("Unable to check existing admin users.", error);
    return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const loginRateLimit = checkRateLimit({
    key: `admin-login:${getClientIp(request)}`,
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });

  if (!loginRateLimit.allowed) {
    return rateLimitJsonResponse("Too many login attempts. Please try again later.", loginRateLimit.retryAfterSeconds);
  }

  if (!isAdminSessionConfigured()) {
    return NextResponse.json(
      { error: "Admin session is not configured. Set ADMIN_SESSION_SECRET." },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const input = loginSchema.parse(body);

    const normalizedUsername = input.username.toLowerCase();

    const [databasePasswordMatches, envPasswordMatches] = await Promise.all([
      validateDatabasePassword(normalizedUsername, input.password),
      validateEnvPassword(input.password),
    ]);

    const envUsernameMatches = secureCompare(normalizedUsername, (env.ADMIN_USERNAME ?? "").toLowerCase());
    const envCredentialsMatch = envUsernameMatches && envPasswordMatches;

    if (!databasePasswordMatches && !envCredentialsMatch) {
      const hasDbAdmin = await hasDatabaseAdminUser();
      const hasEnvAdmin = isAdminAuthConfigured();

      if (!hasDbAdmin && !hasEnvAdmin) {
        return NextResponse.json(
          { error: "No admin account is configured yet. Create one at /admin/setup." },
          { status: 503 },
        );
      }

      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const token = await createAdminSessionToken(normalizedUsername);
    const response = NextResponse.json({ ok: true });

    response.cookies.set({
      name: getAdminSessionCookieName(),
      value: token,
      ...getSecureCookieOptions(getAdminSessionMaxAgeSeconds()),
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid login payload." }, { status: 400 });
  }
}
