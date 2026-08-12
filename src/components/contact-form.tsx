"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { resetTurnstileInForm, TurnstileField } from "@/components/turnstile-field";

type ContactPayload = {
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
  message: string;
  csrfToken: string;
  turnstileToken?: string;
};

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const initialState: FormState = { status: "idle" };

function getContactErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Unable to send message. Please try again.";
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

      const typedIssue = issue as {
        code?: unknown;
        message?: unknown;
        path?: unknown;
      };
      const path = Array.isArray(typedIssue.path) ? typedIssue.path : [];

      if (path.includes("message")) {
        if (typedIssue.code === "too_small") {
          return "Your message is a little short. Please add a few more details.";
        }

        if (typeof typedIssue.message === "string" && typedIssue.message.trim()) {
          return typedIssue.message;
        }
      }
    }
  }

  if (typeof parsedPayload.error === "string" && parsedPayload.error.trim()) {
    return parsedPayload.error;
  }

  return "Unable to send message. Please try again.";
}

type ContactFormProps = {
  csrfToken: string;
  turnstileSiteKey?: string;
};

export function ContactForm({ csrfToken, turnstileSiteKey }: ContactFormProps) {
  const [state, setState] = useState<FormState>(initialState);
  const statusRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (state.status === "error") statusRef.current?.focus();
  }, [state.status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setState({ status: "submitting" });

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload: ContactPayload = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? ""),
      telephone: String(formData.get("telephone") ?? ""),
      message: String(formData.get("message") ?? ""),
      csrfToken,
      turnstileToken: String(formData.get("cf-turnstile-response") ?? ""),
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        resetTurnstileInForm(form);
        setState({
          status: "error",
          message: getContactErrorMessage(responsePayload),
        });

        return;
      }

      const firstName = payload.firstName.trim() || "there";

      setState({
        status: "success",
        message: `Thank you, ${firstName}! Your message is on its way. I'll get back to you soon.`,
      });
      form.reset();
      resetTurnstileInForm(form);
    } catch {
      resetTurnstileInForm(form);
      setState({
        status: "error",
        message: "Unable to send message right now. Please try again in a moment.",
      });
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>First Name</span>
        <input className="editorial-input rounded px-3 py-2" name="firstName" autoComplete="given-name" required />
      </label>
      <label className="form-field">
        <span>Last Name</span>
        <input className="editorial-input rounded px-3 py-2" name="lastName" autoComplete="family-name" required />
      </label>
      <label className="form-field">
        <span>Email</span>
        <input
          className="editorial-input rounded px-3 py-2"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          required
        />
      </label>
      <label className="form-field">
        <span>Telephone</span>
        <input
          className="editorial-input rounded px-3 py-2"
          name="telephone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
        />
      </label>
      <label className="form-field sm:col-span-2">
        <span>Message</span>
        <textarea className="editorial-input rounded px-3 py-2" name="message" rows={5} minLength={5} required />
        <span className="form-helper">Include the subject, location, timing, and how the photographs will be used.</span>
      </label>
      <TurnstileField
        action="contact"
        appearance="interaction-only"
        className="flex justify-center sm:col-span-2"
        siteKey={turnstileSiteKey}
        size="compact"
      />

      <button
        className="editorial-button min-h-11 justify-self-center rounded px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
        type="submit"
        disabled={state.status === "submitting"}
      >
        {state.status === "submitting" ? "Sending…" : "Submit Message"}
      </button>

      {state.status === "success" ? (
        <p className="form-status text-sm text-emerald-700 sm:col-span-2" aria-live="polite">{state.message}</p>
      ) : null}
      {state.status === "error" ? (
        <p ref={statusRef} className="form-status text-sm text-red-700 sm:col-span-2" role="alert" tabIndex={-1}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
