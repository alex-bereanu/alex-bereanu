"use client";

import { useState } from "react";

type ConfirmSubmitButtonProps = {
  label: string;
  confirmLabel: string;
  className?: string;
};

export function ConfirmSubmitButton({ label, confirmLabel, className = "" }: ConfirmSubmitButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button className={className} type="button" onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded border border-red-200 bg-red-50 p-2" role="group" aria-label={`${label} confirmation`}>
      <span className="text-xs font-medium text-red-800">This cannot be undone.</span>
      <button className="min-h-11 rounded border border-red-400 bg-red-700 px-3 py-2 text-xs font-medium text-white" type="submit">
        {confirmLabel}
      </button>
      <button className="min-h-11 rounded border bg-white px-3 py-2 text-xs font-medium" type="button" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  );
}
