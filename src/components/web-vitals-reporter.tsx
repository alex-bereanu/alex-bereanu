"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";

type WebVitalsReporterProps = {
  sampleRate: number;
};

function routeGroup(pathname: string): string {
  if (pathname.startsWith("/g/")) return "/g/[private]";
  if (pathname.startsWith("/portfolio/galleries/")) return "/portfolio/galleries/[slug]";
  if (pathname.startsWith("/admin")) return "/admin";
  return pathname.length <= 100 ? pathname : "/other";
}

export function WebVitalsReporter({ sampleRate }: WebVitalsReporterProps) {
  const sampledRef = useRef(false);
  useEffect(() => {
    sampledRef.current = sampleRate > 0 && Math.random() < sampleRate;
  }, [sampleRate]);
  const reportMetric = useCallback((metric: Parameters<Parameters<typeof useReportWebVitals>[0]>[0]) => {
    if (!sampledRef.current) return;
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      id: metric.id,
      rating: metric.rating,
      routeGroup: routeGroup(window.location.pathname),
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetry/web-vitals", body);
      return;
    }

    void fetch("/api/telemetry/web-vitals", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    });
  }, []);

  useReportWebVitals(reportMetric);
  return null;
}
