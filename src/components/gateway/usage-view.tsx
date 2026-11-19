"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GatewayUsageSummary } from "@/lib/gateway/contracts/usage";
import { gatewayMessage, gatewayRequest } from "@/lib/gateway/client";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

const number = new Intl.NumberFormat();
const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const freshnessLabel = { fresh: "Current", stale: "Stale", estimated: "Estimated" } as const;

export function UsageView({ className, autoRefreshIntervalMs = 30_000 }: {
  className?: string;
  autoRefreshIntervalMs?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<GatewayUsageSummary>();
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const result = await gatewayRequest<GatewayUsageSummary>("/api/gateway/usage", { signal: controller.signal });
      if (!controller.signal.aborted) {
        setUsage(result);
        setError(undefined);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(gatewayMessage(cause, "Usage is unavailable. Try refreshing."));
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const timer = autoRefreshIntervalMs > 0 ? setInterval(refresh, autoRefreshIntervalMs) : undefined;
    return () => {
      clearTimeout(initial);
      if (timer) clearInterval(timer);
      request.current?.abort();
      request.current = null;
    };
  }, [autoRefreshIntervalMs, refresh]);

  const limits = usage?.limits;
  const freshness = error ? "stale" : usage?.freshness;
  const models = Object.entries(usage?.byModel ?? {});
  return (
    <Card className={className} padding={4}>
      <VStack gap={3}>
        <Stack direction="horizontal" align="center" justify="between" wrap="wrap" gap={2}>
          <Heading level={2}>Usage and limits</Heading>
          <Button label="Refresh usage" size="sm" variant="secondary" isLoading={loading} onClick={refresh} />
        </Stack>
        {error && <Banner status="error" role="alert" title={error} />}
        {!usage && loading && <Text role="status">Loading workspace usage…</Text>}
        {usage && freshness && (
          <>
            <Stack direction="horizontal" gap={2} wrap="wrap">
              <Badge variant={freshness === "fresh" ? "success" : "warning"} label={freshnessLabel[freshness]} />
              {limits?.isExceeded && <Badge variant="error" label="Limit reached" />}
            </Stack>
            <Text as="p">
              {new Date(usage.window.start).toLocaleString()} to {new Date(usage.window.end).toLocaleString()}
            </Text>
            <Text as="p">Last updated {new Date(usage.lastUpdatedAt).toLocaleString()}</Text>
            {usage.totals.totalRequests === 0 && <Text as="p">No model attempts in this window.</Text>}
            {freshness === "estimated" && <Text as="p">Some provider measurements may be pending or unavailable.</Text>}
            <MetadataList>
              <MetadataListItem label="Model attempts">{number.format(usage.totals.totalRequests)}</MetadataListItem>
              <MetadataListItem label="Reported prompt tokens">{number.format(usage.totals.promptTokens)}</MetadataListItem>
              <MetadataListItem label="Reported output tokens">{number.format(usage.totals.completionTokens)}</MetadataListItem>
              <MetadataListItem label="Estimated cost (USD)">
                {usage.totals.estimatedCostUsd === undefined ? "Unavailable" : currency.format(usage.totals.estimatedCostUsd)}
              </MetadataListItem>
              {limits?.maxDailyTokens !== undefined && (
                <MetadataListItem label="Daily token limit">
                  {number.format(limits.currentTokensUsed) + " / " + number.format(limits.maxDailyTokens)}
                </MetadataListItem>
              )}
              {limits?.maxDailyBudgetUsd !== undefined && (
                <MetadataListItem label="Daily budget (USD)">
                  {currency.format(limits.currentBudgetUsdUsed) + " / " + currency.format(limits.maxDailyBudgetUsd)}
                </MetadataListItem>
              )}
            </MetadataList>
            {models.length > 0 && (
              <Collapsible defaultIsOpen={false} trigger={<Text>Usage by model</Text>}>
                <MetadataList>
                  {models.map(([model, data]) => (
                    <MetadataListItem key={model} label={model}>
                      {number.format(data.requests)} attempts · {number.format(data.promptTokens)} prompt tokens · {number.format(data.completionTokens)} output tokens
                    </MetadataListItem>
                  ))}
                </MetadataList>
              </Collapsible>
            )}
          </>
        )}
      </VStack>
    </Card>
  );
}
