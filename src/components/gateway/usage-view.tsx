"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Coins, RefreshCw } from "lucide-react";
import { DashboardButton } from "@/components/block/dashboard-shell";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { GatewayUsageSummary } from "@/lib/gateway/contracts/usage";
import { cn } from "@/lib/utils";
import { gatewayMessage, gatewayRequest } from "./gateway-client";

interface UsageViewProps {
  className?: string;
  autoRefreshIntervalMs?: number;
}

const number = new Intl.NumberFormat();
const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 4 });

export function UsageView({ className, autoRefreshIntervalMs = 30_000 }: UsageViewProps) {
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
    } catch (error) {
      if (!controller.signal.aborted) setError(gatewayMessage(error, "Usage is unavailable. Try refreshing."));
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

  const freshness = error ? "stale" : usage?.freshness;
  const limits = usage?.limits;
  const totals = usage?.totals;

  return (
    <Card className={cn("max-w-4xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs", className)}>
      <CardHeader className="gap-3 border-b border-neutral-100 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Coins className="size-4 text-emerald-700" /> Usage &amp; Limits
            {usage && freshness === "fresh" && <Badge variant="success" label="Current" />}
            {usage && freshness === "stale" && <Badge variant="warning" label="Stale" />}
            {usage && freshness === "estimated" && <Badge variant="warning" label="Estimated" />}
            {limits?.isExceeded && <Badge variant="error" label="Limit reached" />}
          </CardTitle>
          {usage && (
            <CardDescription className="mt-2 text-xs">
              {new Date(usage.window.start).toLocaleString()} to {new Date(usage.window.end).toLocaleString()}
              <span className="block">Last updated {new Date(usage.lastUpdatedAt).toLocaleString()}</span>
            </CardDescription>
          )}
        </div>
        <DashboardButton variant="secondary" size="sm" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className={cn("mr-1 size-3.5", loading && "motion-safe:animate-spin")} />
          {loading ? "Checking…" : "Refresh"}
        </DashboardButton>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
        {!usage && loading && <p role="status" className="text-sm text-neutral-600">Loading workspace usage…</p>}
        {totals && (
          <>
            {totals.totalRequests === 0 && <p className="text-sm text-neutral-600">No model attempts in this window.</p>}
            {freshness === "estimated" && <p className="text-xs text-neutral-600">Some provider measurements may be pending or unavailable.</p>}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Model attempts", number.format(totals.totalRequests)],
                ["Reported prompt tokens", number.format(totals.promptTokens)],
                ["Reported output tokens", number.format(totals.completionTokens)],
                ["Estimated cost", totals.estimatedCostUsd === undefined ? "Unavailable" : currency.format(totals.estimatedCostUsd)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-neutral-200 p-3">
                  <dt className="text-xs text-neutral-600">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {limits && (
          <div className="grid gap-3 sm:grid-cols-2">
            {limits.maxDailyTokens !== undefined && (
              <div className="rounded-xl border border-neutral-200 p-3 text-xs">
                <h3 className="font-semibold">Daily token limit</h3>
                <p className="mt-2">{number.format(limits.currentTokensUsed)} / {number.format(limits.maxDailyTokens)} tokens</p>
              </div>
            )}
            {limits.maxDailyBudgetUsd !== undefined && (
              <div className="rounded-xl border border-neutral-200 p-3 text-xs">
                <h3 className="font-semibold">Daily budget</h3>
                <p className="mt-2">{currency.format(limits.currentBudgetUsdUsed)} / {currency.format(limits.maxDailyBudgetUsd)}</p>
              </div>
            )}
          </div>
        )}
        {usage && Object.keys(usage.byModel).length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full text-left text-xs">
              <caption className="bg-neutral-50 px-3 py-2 text-left font-semibold">Usage by model</caption>
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Model</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Attempts</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Prompt tokens</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Output tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {Object.entries(usage.byModel).map(([model, details]) => (
                  <tr key={model}>
                    <th scope="row" className="px-3 py-2 font-medium">{model}</th>
                    <td className="px-3 py-2 text-right">{number.format(details.requests)}</td>
                    <td className="px-3 py-2 text-right">{number.format(details.promptTokens)}</td>
                    <td className="px-3 py-2 text-right">{number.format(details.completionTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
