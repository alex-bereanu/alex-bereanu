"use client";

import { useEffect, useRef, useState } from "react";

type ConfirmSubmitButtonProps = {
  label: string;
  confirmLabel: string;
  className?: string;
};

export function ConfirmSubmitButton({ label, confirmLabel, className = "" }: ConfirmSubmitButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!confirming) return;
    confirmButtonRef.current?.focus();
    const timeout = window.setTimeout(() => setConfirming(false), 15_000);
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirming(false);
    }
    window.addEventListener("keydown", cancelOnEscape);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", cancelOnEscape);
    };
  }, [confirming]);

  if (!confirming) {
    return (
      <button className={className} type="button" onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded border border-red-200 bg-red-50 p-2" role="group" aria-label={`${label} confirmation`}>
      <span className="text-xs font-medium text-red-800" aria-live="polite">This cannot be undone. Confirmation expires in 15 seconds.</span>
      <button ref={confirmButtonRef} className="min-h-11 rounded border border-red-400 bg-red-700 px-3 py-2 text-xs font-medium text-white" type="submit">
        {confirmLabel}
      </button>
      <button className="min-h-11 rounded border bg-white px-3 py-2 text-xs font-medium" type="button" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  );
}
