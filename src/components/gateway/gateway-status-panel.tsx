"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { RefreshCw, Server } from "lucide-react";
import { DashboardButton } from "@/components/block/dashboard-shell";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { ComponentHealth, GatewayStatusResponse, ReadinessResponse } from "@/lib/gateway/contracts/health";
import { cn } from "@/lib/utils";
import { GATEWAY_ACCESS_CHANGED, gatewayMessage, readGatewayError } from "./gateway-client";

export interface GatewayStatusPanelProps {
  className?: string;
  autoRefreshIntervalMs?: number;
}

const components = {
  storage: "Storage",
  secrets: "Secrets",
  activeConnections: "Connections",
  eventBus: "Event bus",
} as const;

const healthBadge = {
  healthy: { label: "Healthy", variant: "success" },
  degraded: { label: "Degraded", variant: "warning" },
  unhealthy: { label: "Unhealthy", variant: "error" },
  initializing: { label: "Initializing", variant: "neutral" },
} as const satisfies Record<ComponentHealth, { label: string; variant: string }>;

type StatusObservation = Pick<ReadinessResponse, "status" | "checkedAt"> & { retryAfterSeconds?: number };

export function GatewayStatusPanel({ className, autoRefreshIntervalMs = 15_000 }: GatewayStatusPanelProps) {
  const [loading, setLoading] = useState(true);
  const [observation, setObservation] = useState<StatusObservation>();
  const [details, setDetails] = useState<GatewayStatusResponse>();
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const res = await fetch("/api/gateway/status", { cache: "no-store", signal: controller.signal });
      if (res.ok) {
        const current: GatewayStatusResponse = await res.json();
        if (controller.signal.aborted) return;
        setObservation(current);
        setDetails(current);
      } else if (res.status === 503) {
        const ready = await fetch("/api/gateway/health/ready", { cache: "no-store", signal: controller.signal });
        if (!ready.ok && ready.status !== 503) throw await readGatewayError(ready);
        const data: StatusObservation = await ready.json();
        const hint = Number(ready.headers.get("Retry-After") ?? res.headers.get("Retry-After"));
        if (controller.signal.aborted) return;
        setObservation({ ...data, retryAfterSeconds: data.retryAfterSeconds ?? (hint > 0 ? hint : undefined) });
        setDetails(undefined);
      } else {
        if (res.status === 401) window.dispatchEvent(new Event(GATEWAY_ACCESS_CHANGED));
        throw await readGatewayError(res);
      }
      setError(undefined);
    } catch (error) {
      if (!controller.signal.aborted) setError(gatewayMessage(error, "The gateway status could not be reached."));
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    return () => {
      clearTimeout(initial);
      request.current?.abort();
      request.current = null;
    };
  }, [refresh]);

  const retryDelay = observation?.retryAfterSeconds ? Math.max(observation.retryAfterSeconds * 1000, 1000) : autoRefreshIntervalMs;
  useEffect(() => {
    if (retryDelay <= 0) return;
    const timer = setInterval(refresh, retryDelay);
    return () => clearInterval(timer);
  }, [refresh, retryDelay]);

  const label = error
    ? details ? "Stale" : "Unavailable"
    : observation?.status === "ready" ? "Ready"
      : observation ? observation.status.charAt(0).toUpperCase() + observation.status.slice(1)
        : "Checking…";
  const variant = error ? (details ? "warning" : "error") : observation?.status === "ready" ? "success" : "neutral";

  return (
    <Card className={cn("overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs", className)}>
      <CardHeader className="gap-3 border-b border-neutral-100 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Server className="size-4" /> Gateway readiness
            <span role="status"><Badge variant={variant} label={label} /></span>
          </CardTitle>
          {observation && <CardDescription className="mt-2 text-xs">Last checked {new Date(observation.checkedAt).toLocaleString()}</CardDescription>}
        </div>
        <DashboardButton variant="secondary" size="sm" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className={cn("mr-1 size-3.5", loading && "motion-safe:animate-spin")} />
          {loading ? "Checking…" : "Retry"}
        </DashboardButton>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
        {!error && observation?.retryAfterSeconds && (
          <p className="text-xs text-neutral-600">The gateway requested another check in {observation.retryAfterSeconds} seconds.</p>
        )}
        {details && (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(components).map(([component, label]) => {
                const health = details.components[component as keyof typeof components];
                return (
                  <div key={component} className="space-y-2 rounded-lg border border-neutral-200 p-3">
                    <dt className="text-xs font-semibold text-neutral-700">{label}</dt>
                    <dd><Badge {...healthBadge[health]} /></dd>
                  </div>
                );
              })}
            </dl>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
              <span>{details.metrics.activeSessions} active sessions · {details.metrics.activeRuns} active runs</span>
              <span className="break-all font-mono">Request {details.requestId}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
