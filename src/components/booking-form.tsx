"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { resetTurnstileInForm, TurnstileField } from "@/components/turnstile-field";

type BookingPayload = {
  firstName: string;
  lastName: string;
  email: string;
  whatsapp: string;
  eventDate: string;
  eventType: string;
  eventDuration: string;
  approximateGuestCount: number;
  additionalNotes?: string;
  csrfToken: string;
  turnstileToken?: string;
};

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const initialState: FormState = { status: "idle" };

function getBookingErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Unable to send booking request. Please try again.";
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
        message?: unknown;
      };

      if (typeof typedIssue.message === "string" && typedIssue.message.trim()) {
        return typedIssue.message;
      }
    }
  }

  if (typeof parsedPayload.error === "string" && parsedPayload.error.trim()) {
    return parsedPayload.error;
  }

  return "Unable to send booking request. Please try again.";
}

type BookingFormProps = {
  csrfToken: string;
  turnstileSiteKey?: string;
};

export function BookingForm({ csrfToken, turnstileSiteKey }: BookingFormProps) {
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

    const payload: BookingPayload = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? ""),
      whatsapp: String(formData.get("whatsapp") ?? ""),
      eventDate: String(formData.get("eventDate") ?? ""),
      eventType: String(formData.get("eventType") ?? ""),
      eventDuration: String(formData.get("eventDuration") ?? ""),
      approximateGuestCount: Number(formData.get("approximateGuestCount") ?? 0),
      additionalNotes: String(formData.get("additionalNotes") ?? "").trim() || undefined,
      csrfToken,
      turnstileToken: String(formData.get("cf-turnstile-response") ?? ""),
    };

    try {
      const response = await fetch("/api/bookings", {
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
          message: getBookingErrorMessage(responsePayload),
        });

        return;
      }

      const firstName = payload.firstName.trim() || "there";

      setState({
        status: "success",
        message: `Thank you, ${firstName}! Your booking request was sent, and I'll reach out shortly.`,
      });
      form.reset();
      resetTurnstileInForm(form);
    } catch {
      resetTurnstileInForm(form);
      setState({
        status: "error",
        message: "Unable to send booking request right now. Please try again in a moment.",
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
        <span>WhatsApp Number</span>
        <input
          className="editorial-input rounded px-3 py-2"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
        />
      </label>
      <label className="form-field">
        <span>Event Date</span>
        <input className="editorial-input rounded px-3 py-2" name="eventDate" type="date" autoComplete="off" required />
      </label>
      <label className="form-field">
        <span>Event Type</span>
        <input className="editorial-input rounded px-3 py-2" name="eventType" autoComplete="off" required />
      </label>
      <label className="form-field">
        <span>Event Duration</span>
        <input className="editorial-input rounded px-3 py-2" name="eventDuration" autoComplete="off" required />
      </label>
      <label className="form-field">
        <span>Approximate Guest Count</span>
        <input
          className="editorial-input rounded px-3 py-2"
          name="approximateGuestCount"
          type="number"
          inputMode="numeric"
          autoComplete="off"
          min={1}
          required
        />
      </label>
      <label className="form-field sm:col-span-2">
        <span>Additional Notes <span className="font-normal text-neutral-500">(Optional)</span></span>
        <textarea className="editorial-input rounded px-3 py-2" name="additionalNotes" rows={4} />
      </label>
      <TurnstileField action="booking" className="sm:col-span-2" siteKey={turnstileSiteKey} />

      <button
        className="editorial-button min-h-11 justify-self-center rounded px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
        type="submit"
        disabled={state.status === "submitting"}
      >
        {state.status === "submitting" ? "Sending…" : "Submit Booking"}
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
