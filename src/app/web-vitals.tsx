"use client";

import { useReportWebVitals } from "next/web-vitals";

const tracked = new Set(["LCP", "INP", "CLS", "TTFB"]);

const report: Parameters<typeof useReportWebVitals>[0] = ({ name, id, value, rating }) => {
  if (tracked.has(name)) console.info("[kantha:web-vitals]", { name, id, value, rating });
};

export function WebVitals() {
  useReportWebVitals(report);
  return null;
}
