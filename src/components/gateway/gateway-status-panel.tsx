"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gatewayMessage, gatewayRequest, GatewayRequestError } from "@/lib/gateway/client";
import type { GatewayHealthStatus, GatewayStatusResponse } from "@/lib/gateway/contracts/health";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

const componentNames = { storage: "Storage", secrets: "Secrets", activeConnections: "Connections", eventBus: "Event bus" } as const;
const health = { healthy: "success", degraded: "warning", unhealthy: "error", initializing: "neutral" } as const;
const readiness = { ready: "Ready", starting: "Starting", draining: "Draining", stopping: "Stopping", error: "Error" } as const;

interface Observation {
  status: GatewayHealthStatus;
  checkedAt: string;
  retryAfterSeconds?: number;
  details?: GatewayStatusResponse;
}

export function GatewayStatusPanel({ className, autoRefreshIntervalMs = 15_000 }: {
  className?: string;
  autoRefreshIntervalMs?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [observation, setObservation] = useState<Observation>();
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      let next: Observation;
      try {
        const details = await gatewayRequest<GatewayStatusResponse>("/api/gateway/status", { signal: controller.signal });
        next = { status: details.status, checkedAt: details.checkedAt, details };
      } catch (cause) {
        if (!(cause instanceof GatewayRequestError) || cause.status !== 503) throw cause;
        const probe = await fetch("/api/gateway/health/ready", { cache: "no-store", signal: controller.signal });
        if (!probe.ok && probe.status !== 503) throw cause;
        const result = await probe.json() as { status: GatewayHealthStatus };
        const retry = Number(probe.headers.get("retry-after"));
        next = {
          status: result.status, checkedAt: new Date().toISOString(),
          retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : undefined,
        };
      }
      if (!controller.signal.aborted) {
        setObservation(next);
        setError(undefined);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(gatewayMessage(cause, "Gateway diagnostics are unavailable."));
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

  const interval = observation?.retryAfterSeconds ? observation.retryAfterSeconds * 1000 : autoRefreshIntervalMs;
  useEffect(() => {
    if (interval <= 0) return;
    const timer = setInterval(refresh, interval);
    return () => clearInterval(timer);
  }, [interval, refresh]);

  const details = observation?.details;
  const label = error ? (observation ? "Stale" : "Unavailable") : observation ? readiness[observation.status] : "Checking…";
  const variant = error ? (observation ? "warning" : "error") : observation?.status === "ready" ? "success" : "neutral";

  return (
    <Card className={className} padding={4}>
      <VStack gap={3}>
        <Stack direction="horizontal" align="center" justify="between" wrap="wrap" gap={2}>
          <Heading level={2}>Gateway readiness</Heading>
          <Button label="Refresh gateway status" size="sm" variant="secondary" isLoading={loading} onClick={refresh} />
        </Stack>
        <Text role="status"><Badge label={label} variant={variant} /></Text>
        {observation && <Text as="p">Last checked {new Date(observation.checkedAt).toLocaleString()}</Text>}
        {error && <Banner status="error" role="alert" title={error} />}
        {observation?.retryAfterSeconds && <Text as="p">Retrying in {observation.retryAfterSeconds} seconds.</Text>}
        {details && (
          <MetadataList>
            {(Object.keys(componentNames) as (keyof typeof componentNames)[]).map((key) => (
              <MetadataListItem key={key} label={componentNames[key]}>
                <Badge variant={health[details.components[key]]} label={details.components[key]} />
              </MetadataListItem>
            ))}
            <MetadataListItem label="Active sessions">{details.metrics.activeSessions}</MetadataListItem>
            <MetadataListItem label="Active runs">{details.metrics.activeRuns}</MetadataListItem>
            <MetadataListItem label="Request ID">{details.requestId}</MetadataListItem>
          </MetadataList>
        )}
      </VStack>
    </Card>
  );
}
