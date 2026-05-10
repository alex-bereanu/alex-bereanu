"use client";

import { FormEvent, useState } from "react";

type ContactPayload = {
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
  message: string;
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

export function ContactForm() {
  const [state, setState] = useState<FormState>(initialState);

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
    } catch {
      setState({
        status: "error",
        message: "Unable to send message right now. Please try again in a moment.",
      });
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
      <input className="editorial-input rounded px-3 py-2" name="firstName" placeholder="First Name" required />
      <input className="editorial-input rounded px-3 py-2" name="lastName" placeholder="Last Name" required />
      <input className="editorial-input rounded px-3 py-2" name="email" placeholder="Email" type="email" required />
      <input className="editorial-input rounded px-3 py-2" name="telephone" placeholder="Telephone" required />
      <textarea
        className="editorial-input rounded px-3 py-2 sm:col-span-2"
        name="message"
        placeholder="Message"
        rows={5}
        minLength={5}
        required
      />

      <button
        className="editorial-button justify-self-center rounded px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
        type="submit"
        disabled={state.status === "submitting"}
      >
        {state.status === "submitting" ? "Sending..." : "Submit message"}
      </button>

      {state.status === "success" && <p className="text-sm text-emerald-700 sm:col-span-2">{state.message}</p>}
      {state.status === "error" && <p className="text-sm text-red-700 sm:col-span-2">{state.message}</p>}
    </form>
  );
}
