"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

type AdminLoginFormProps = {
  googleOAuthEnabled?: boolean;
};

function getLoginErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Sign in failed. Please verify your credentials.";
  }

  const parsedPayload = payload as {
    error?: unknown;
  };

  if (typeof parsedPayload.error === "string" && parsedPayload.error.trim()) {
    return parsedPayload.error;
  }

  return "Sign in failed. Please verify your credentials.";
}

function getOAuthErrorMessage(error: string | null): string | null {
  switch (error) {
    case "google_oauth_not_configured":
      return "Google sign in is not configured yet.";
    case "google_oauth_cancelled":
      return "Google sign in was cancelled.";
    case "google_oauth_unauthorized":
      return "That Google account is not allowed to access Admin.";
    case "google_oauth_failed":
      return "Google sign in failed. Please try again.";
    default:
      return null;
  }
}

function getSafeAdminNextPath(value: string | null): string {
  const nextPath = value?.trim();

  if (!nextPath) {
    return "/admin";
  }

  if (nextPath === "/admin" || nextPath.startsWith("/admin/") || nextPath.startsWith("/admin?")) {
    return nextPath;
  }

  return "/admin";
}

export function AdminLoginForm({ googleOAuthEnabled = false }: AdminLoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => getSafeAdminNextPath(searchParams.get("next")), [searchParams]);
  const googleLoginHref = useMemo(
    () => `/api/admin/oauth/google?${new URLSearchParams({ next: nextPath }).toString()}`,
    [nextPath],
  );
  const oauthErrorMessage = useMemo(() => getOAuthErrorMessage(searchParams.get("error")), [searchParams]);

  const [state, setState] = useState<FormState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: String(formData.get("username") ?? ""),
          password: String(formData.get("password") ?? ""),
        }),
      });
      const responsePayload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        setState({
          status: "error",
          message: getLoginErrorMessage(responsePayload),
        });

        return;
      }

      router.replace(nextPath);
    } catch {
      setState({
        status: "error",
        message: "Sign in failed. Please verify your credentials.",
      });
    }
  }

  return (
    <div className="rounded border bg-white p-6">
      <h1 className="text-2xl font-semibold">Admin sign in</h1>
      <p className="mt-2 text-sm text-neutral-700">Use your admin username and password to continue.</p>

      {googleOAuthEnabled && (
        <div className="mt-6 grid gap-4">
          <Link
            className="flex min-h-11 items-center justify-center rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-neutral-50"
            href={googleLoginHref}
          >
            Continue with Google
          </Link>

          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-neutral-500">
            <span className="h-px flex-1 bg-neutral-200" />
            <span>or</span>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>
        </div>
      )}

      <form className="mt-6 grid gap-3" onSubmit={handleSubmit}>
        <input className="rounded border px-3 py-2" name="username" placeholder="Username" required />
        <input className="rounded border px-3 py-2" name="password" type="password" placeholder="Password" required />

        <button
          className="rounded bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={state.status === "submitting"}
        >
          {state.status === "submitting" ? "Signing in..." : "Sign in"}
        </button>

        {state.status === "error" && <p className="text-sm text-red-700">{state.message}</p>}
        {state.status !== "error" && oauthErrorMessage && <p className="text-sm text-red-700">{oauthErrorMessage}</p>}
      </form>

      <p className="mt-4 text-sm text-neutral-700">
        First time setup? <Link className="underline" href="/admin/setup">Create admin account</Link>
      </p>
    </div>
  );
}
