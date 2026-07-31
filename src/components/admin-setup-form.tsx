"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { resetTurnstileInForm, TurnstileField } from "@/components/turnstile-field";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

function getSetupErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Unable to create admin account. Please try again.";
  }

  const parsedPayload = payload as {
    error?: unknown;
    issues?: unknown;
  };

  if (Array.isArray(parsedPayload.issues)) {
    for (const issue of parsedPayload.issues) {
      if (!issue || typeof issue !== "object") {
        continue;
      }

      const typedIssue = issue as { message?: unknown };

      if (typeof typedIssue.message === "string" && typedIssue.message.trim()) {
        return typedIssue.message;
      }
    }
  }

  if (typeof parsedPayload.error === "string" && parsedPayload.error.trim()) {
    return parsedPayload.error;
  }

  return "Unable to create admin account. Please try again.";
}

type AdminSetupFormProps = {
  csrfToken: string;
  turnstileSiteKey?: string;
};

export function AdminSetupForm({ csrfToken, turnstileSiteKey }: AdminSetupFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({ status: "idle" });
  const statusRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (state.status === "error") statusRef.current?.focus();
  }, [state.status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/admin/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: String(formData.get("username") ?? ""),
          password: String(formData.get("password") ?? ""),
          confirmPassword: String(formData.get("confirmPassword") ?? ""),
          setupToken: String(formData.get("setupToken") ?? ""),
          csrfToken,
          turnstileToken: String(formData.get("cf-turnstile-response") ?? ""),
        }),
      });

      const responsePayload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        resetTurnstileInForm(form);
        setState({
          status: "error",
          message: getSetupErrorMessage(responsePayload),
        });

        return;
      }

      form.reset();
      resetTurnstileInForm(form);
      router.replace("/admin");
    } catch {
      resetTurnstileInForm(form);
      setState({
        status: "error",
        message: "Unable to create admin account right now. Please try again in a moment.",
      });
    }
  }

  return (
    <div className="rounded border bg-white p-6">
      <h1 className="text-2xl font-semibold">Create admin account</h1>
      <p className="mt-2 text-sm text-neutral-700">Set up your first admin username and password.</p>

      <form className="mt-6 grid gap-3" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>One-Time Setup Token</span>
          <input className="rounded border px-3 py-2" name="setupToken" type="password" minLength={32} autoComplete="off" required />
        </label>
        <label className="form-field">
          <span>Username</span>
          <input className="rounded border px-3 py-2" name="username" minLength={3} maxLength={64} autoComplete="username" spellCheck={false} required />
        </label>
        <label className="form-field">
          <span>Password</span>
          <input className="rounded border px-3 py-2" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required />
          <span className="form-helper">Use at least 12 characters.</span>
        </label>
        <label className="form-field">
          <span>Confirm Password</span>
          <input className="rounded border px-3 py-2" name="confirmPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" required />
        </label>
        <TurnstileField action="admin_setup" siteKey={turnstileSiteKey} />

        <button
          className="min-h-11 rounded bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={state.status === "submitting"}
        >
          {state.status === "submitting" ? "Creating Account…" : "Create Admin Account"}
        </button>

        {state.status === "error" ? <p ref={statusRef} className="form-status text-sm text-red-700" role="alert" tabIndex={-1}>{state.message}</p> : null}
      </form>

      <p className="mt-4 text-sm text-neutral-700">
        Already have an account? <Link className="underline" href="/admin/login">Sign in</Link>
      </p>
    </div>
  );
}
