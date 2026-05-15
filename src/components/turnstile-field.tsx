"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

type TurnstileWindow = Window & {
  turnstile?: TurnstileApi;
  __turnstileScriptLoading?: Promise<void>;
};

type TurnstileFieldProps = {
  siteKey?: string;
  className?: string;
};

function loadTurnstileScript(): Promise<void> {
  const turnstileWindow = window as TurnstileWindow;

  if (turnstileWindow.turnstile) {
    return Promise.resolve();
  }

  if (turnstileWindow.__turnstileScriptLoading) {
    return turnstileWindow.__turnstileScriptLoading;
  }

  turnstileWindow.__turnstileScriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load verification challenge."));
    document.head.append(script);
  });

  return turnstileWindow.__turnstileScriptLoading;
}

export function TurnstileField({ siteKey, className }: TurnstileFieldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      return;
    }

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current) {
          return;
        }

        const turnstile = (window as TurnstileWindow).turnstile;

        if (!turnstile) {
          return;
        }

        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: setToken,
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
        containerRef.current.dataset.turnstileWidgetId = widgetIdRef.current;
      })
      .catch(() => setToken(""));

    return () => {
      cancelled = true;

      if (widgetIdRef.current && (window as TurnstileWindow).turnstile) {
        (window as TurnstileWindow).turnstile?.remove(widgetIdRef.current);
      }
    };
  }, [siteKey]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className={className}>
      <div ref={containerRef} />
      <input type="hidden" name="cf-turnstile-response" value={token} />
    </div>
  );
}

export function resetTurnstileInForm(form: HTMLFormElement): void {
  const turnstile = (window as TurnstileWindow).turnstile;

  if (!turnstile) {
    return;
  }

  form.querySelectorAll<HTMLElement>("[data-turnstile-widget-id]").forEach((element) => {
    const widgetId = element.dataset.turnstileWidgetId;

    if (widgetId) {
      turnstile.reset(widgetId);
    }
  });
}
