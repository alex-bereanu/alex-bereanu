"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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

export function AdminSetupForm() {
  const router = useRouter();
  const [state, setState] = useState<FormState>({ status: "idle" });

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
        }),
      });

      const responsePayload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        setState({
          status: "error",
          message: getSetupErrorMessage(responsePayload),
        });

        return;
      }

      form.reset();
      router.replace("/admin");
    } catch {
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
        <input
          className="rounded border px-3 py-2"
          name="username"
          placeholder="Username"
          minLength={3}
          maxLength={64}
          required
        />
        <input
          className="rounded border px-3 py-2"
          name="password"
          type="password"
          placeholder="Password"
          minLength={8}
          maxLength={128}
          required
        />
        <input
          className="rounded border px-3 py-2"
          name="confirmPassword"
          type="password"
          placeholder="Confirm password"
          minLength={8}
          maxLength={128}
          required
        />

        <button
          className="rounded bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={state.status === "submitting"}
        >
          {state.status === "submitting" ? "Creating account..." : "Create admin account"}
        </button>

        {state.status === "error" ? <p className="text-sm text-red-700">{state.message}</p> : null}
      </form>

      <p className="mt-4 text-sm text-neutral-700">
        Already have an account? <Link className="underline" href="/admin/login">Sign in</Link>
      </p>
    </div>
  );
}