"use client";

import { FormEvent, useState } from "react";

type AdminShareLinkFormProps = {
  csrfToken: string;
  galleryId: string;
};

type CreatedLink = {
  galleryUrl: string;
  expiresAt: string;
  passwordMustBeSharedSeparately: boolean;
  emailStatus: "NOT_REQUESTED" | "SENT" | "SKIPPED" | "FAILED";
};

export function AdminShareLinkForm({ csrfToken, galleryId }: AdminShareLinkFormProps) {
  const [createdLink, setCreatedLink] = useState<CreatedLink | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setCreatedLink(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/admin/actions/galleries/share-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken,
          galleryId,
          password: String(formData.get("password") ?? ""),
          recipientEmail: String(formData.get("recipientEmail") ?? ""),
          expiresAt: String(formData.get("expiresAt") ?? ""),
          maxDownloads: String(formData.get("maxDownloads") ?? ""),
          sendEmail: formData.get("sendEmail") === "on",
        }),
      });
      const payload = (await response.json().catch(() => null)) as (CreatedLink & { error?: string }) | null;

      if (!response.ok || !payload?.galleryUrl) {
        setMessage(payload?.error ?? "Unable to create a secure share link.");
        return;
      }

      setCreatedLink(payload);
      setMessage(
        payload.emailStatus === "FAILED"
          ? "Secure link created, but email delivery failed. Copy the link now and send it manually."
          : payload.emailStatus === "SKIPPED"
            ? "Secure link created, but email is not configured. Copy the link now and send it manually."
            : "Secure link created. Copy it now; the capability token is not stored in recoverable form.",
      );
      form.reset();
    } catch {
      setMessage("Unable to create a secure share link right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyCreatedLink() {
    if (!createdLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdLink.galleryUrl);
      setMessage("Secure gallery link copied.");
    } catch {
      setMessage("Select and copy the secure gallery link manually.");
    }
  }

  return (
    <div className="space-y-3">
      <form className="grid gap-2" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Password <span className="font-normal text-neutral-500">(Optional)</span></span>
          <input className="rounded border px-3 py-2 text-base" name="password" type="password" minLength={12} maxLength={200} autoComplete="new-password" />
          <span className="form-helper">Use at least 12 characters and share it through a separate channel.</span>
        </label>
        <label className="form-field">
          <span>Recipient Email <span className="font-normal text-neutral-500">(Optional)</span></span>
          <input className="rounded border px-3 py-2 text-base" name="recipientEmail" type="email" inputMode="email" autoComplete="email" spellCheck={false} />
        </label>
        <label className="grid gap-1 text-xs text-neutral-700">
          <span>Expiry (defaults to 30 days)</span>
          <input className="rounded border px-3 py-2 text-base" name="expiresAt" type="datetime-local" autoComplete="off" />
        </label>
        <label className="form-field">
          <span>Maximum Downloads <span className="font-normal text-neutral-500">(Optional)</span></span>
          <input className="rounded border px-3 py-2 text-base" name="maxDownloads" type="number" inputMode="numeric" min={1} max={10_000} autoComplete="off" />
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-neutral-700">
          <input name="sendEmail" type="checkbox" /> Send link via email
        </label>
        <p className="text-[11px] leading-4 text-neutral-600">
          If you add a password, send it through a separate channel. It is never included in the link email.
        </p>
        <button
          className="min-h-11 rounded border px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating Secure URL…" : "Generate Secure URL"}
        </button>
      </form>

      {createdLink ? (
        <div className="grid gap-2 rounded border border-emerald-200 bg-emerald-50 p-3">
          <label className="grid gap-1 text-xs font-medium text-emerald-950">
            <span>Copy this link now</span>
            <input className="rounded border bg-white px-2 py-2 font-mono text-[11px]" readOnly value={createdLink.galleryUrl} />
          </label>
          <button className="min-h-11 rounded border border-emerald-300 bg-white px-3 py-2 text-xs font-medium" type="button" onClick={copyCreatedLink}>
            Copy Link
          </button>
        </div>
      ) : null}

      {message ? <p className="text-xs text-neutral-700" role="status" aria-live="polite">{message}</p> : null}
    </div>
  );
}
