import { Suspense } from "react";

import { AdminLoginForm } from "@/components/admin-login-form";
import { env } from "@/config/env";
import { isAdminGoogleOAuthConfigured } from "@/server/auth/admin-google-oauth";
import { isPasswordAdminLoginEnabled } from "@/server/auth/admin-session";
import { createCsrfToken } from "@/server/security/request-protection";

export const dynamic = "force-dynamic";

function LoginFallback() {
  return (
    <div className="rounded border bg-white p-6">
      <h1 className="text-2xl font-semibold">Admin sign in</h1>
      <p className="mt-2 text-sm text-neutral-700">Loading login form...</p>
    </div>
  );
}

export default function AdminLoginPage() {
  const csrfToken = createCsrfToken();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
      <Suspense fallback={<LoginFallback />}>
        <AdminLoginForm
          csrfToken={csrfToken}
          googleOAuthEnabled={isAdminGoogleOAuthConfigured()}
          passwordLoginEnabled={isPasswordAdminLoginEnabled()}
          turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        />
      </Suspense>
    </main>
  );
}
