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

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

async function validateDatabasePassword(
  username: string,
  password: string,
): Promise<{ id: string; username: string } | null> {
  if (!env.DATABASE_URL) {
    return null;
  }

  try {
    const adminUser = await prisma.adminUser.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
        username: true,
        passwordHash: true,
      },
    });

    if (!adminUser) {
      return null;
    }

    const passwordMatches = await bcrypt.compare(password, adminUser.passwordHash);
    return passwordMatches ? { id: adminUser.id, username: adminUser.username } : null;
  } catch (error) {
    console.error("Unable to read admin users from database.", error);
    return null;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const clientIp = getClientIp(request);
  const loginRateLimit = await checkRateLimit({
    key: buildRateLimitKey("admin-login", request),
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });

  if (!loginRateLimit.allowed) {
    await recordSecurityAuditEvent({ eventType: "admin.login", outcome: "DENIED", clientIp, metadata: { reason: "rate_limited" } });
    return rateLimitJsonResponse("Too many login attempts. Please try again later.", loginRateLimit.retryAfterSeconds);
  }

  if (!isAdminSessionConfigured()) {
    return NextResponse.json(
      { error: "Admin sessions are not configured. Set DATABASE_URL and apply the Phase 1 schema migration." },
      { status: 503 },
    );
  }

  if (!isPasswordAdminLoginEnabled()) {
    return NextResponse.json({ error: "Password-based admin login is disabled." }, { status: 404 });
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
      "admin_login",
    );

    if (turnstileError) {
      return turnstileError;
    }

    const input = loginSchema.parse(body);

    const normalizedUsername = input.username.toLowerCase();

    const adminUser = await validateDatabasePassword(normalizedUsername, input.password);

    if (!adminUser) {
      await recordSecurityAuditEvent({
        eventType: "admin.login",
        outcome: "FAILURE",
        actor: normalizedUsername,
        clientIp,
        metadata: { provider: "password", reason: "invalid_credentials" },
      });
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const token = await createAdminSessionToken(`admin:${adminUser.id}`, "password");
    const response = NextResponse.json({ ok: true });

    response.cookies.set({
      name: getAdminSessionCookieName(),
      value: token,
      ...getSecureCookieOptions(getAdminSessionMaxAgeSeconds()),
    });

    await recordSecurityAuditEvent({
      eventType: "admin.login",
      outcome: "SUCCESS",
      actor: `admin:${adminUser.id}`,
      clientIp,
      metadata: { provider: "password" },
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid login payload." }, { status: 400 });
  }
}
