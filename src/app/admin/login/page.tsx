import { Suspense } from "react";

import { AdminLoginForm } from "@/components/admin-login-form";
import { isAdminGoogleOAuthConfigured } from "@/server/auth/admin-google-oauth";

function LoginFallback() {
  return (
    <div className="rounded border bg-white p-6">
      <h1 className="text-2xl font-semibold">Admin sign in</h1>
      <p className="mt-2 text-sm text-neutral-700">Loading login form...</p>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
      <Suspense fallback={<LoginFallback />}>
        <AdminLoginForm googleOAuthEnabled={isAdminGoogleOAuthConfigured()} />
      </Suspense>
    </main>
  );
}
