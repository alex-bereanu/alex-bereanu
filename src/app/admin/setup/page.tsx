import { notFound, redirect } from "next/navigation";

import { env } from "@/config/env";
import { AdminSetupForm } from "@/components/admin-setup-form";
import { prisma } from "@/lib/db";
import { isAdminSessionConfigured, isPasswordAdminLoginEnabled } from "@/server/auth/admin-session";
import { createCsrfToken } from "@/server/security/request-protection";

export const dynamic = "force-dynamic";

export default async function AdminSetupPage() {
  if (!isPasswordAdminLoginEnabled() || !env.ADMIN_SETUP_TOKEN) {
    notFound();
  }

  if (!env.DATABASE_URL) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
        <div className="rounded border bg-white p-6">
          <h1 className="text-2xl font-semibold">Create admin account</h1>
          <p className="mt-2 text-sm text-red-700">DATABASE_URL is required before creating an admin account.</p>
        </div>
      </main>
    );
  }

  if (!isAdminSessionConfigured()) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
        <div className="rounded border bg-white p-6">
          <h1 className="text-2xl font-semibold">Create admin account</h1>
          <p className="mt-2 text-sm text-red-700">Database-backed admin sessions are not configured.</p>
        </div>
      </main>
    );
  }

  try {
    const existingAdmin = await prisma.adminUser.findFirst({
      select: { id: true },
    });

    if (existingAdmin) {
      redirect("/admin/login");
    }
  } catch {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
        <div className="rounded border bg-white p-6">
          <h1 className="text-2xl font-semibold">Create admin account</h1>
          <p className="mt-2 text-sm text-red-700">
            Admin users table is not ready yet. Run a Prisma migration/push, then reload this page.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
      <AdminSetupForm csrfToken={createCsrfToken()} turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
    </main>
  );
}
