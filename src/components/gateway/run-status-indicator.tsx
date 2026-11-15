"use client";

import * as React from "react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldAlert,
  RotateCcw,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RunStatus } from "@/lib/gateway/contracts/run";

export interface RunStatusIndicatorProps {
  status: RunStatus | "reconnecting";
  runId?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function RunStatusIndicator({
  status,
  runId,
  onRetry,
  className,
  compact = false,
}: RunStatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case "queued":
        return {
          label: "Queued",
          icon: Clock,
          variant: "neutral" as const,
          description: "Waiting for admission queue",
          color: "text-neutral-500",
        };
      case "running":
        return {
          label: "Running",
          icon: Loader2,
          variant: "info" as const,
          description: "Active generation in progress",
          spin: true,
          color: "text-blue-600",
        };
      case "waiting_for_approval":
        return {
          label: "Approval Required",
          icon: ShieldAlert,
          variant: "warning" as const,
          description: "Tool execution awaiting operator decision",
          color: "text-amber-600",
        };
      case "completed":
        return {
          label: "Completed",
          icon: CheckCircle2,
          variant: "success" as const,
          description: "Run completed successfully",
          color: "text-emerald-600",
        };
      case "failed":
        return {
          label: "Failed",
          icon: AlertCircle,
          variant: "error" as const,
          description: "Terminal execution error",
          color: "text-rose-600",
        };
      case "cancelled":
        return {
          label: "Cancelled",
          icon: AlertCircle,
          variant: "neutral" as const,
          description: "Run cancelled by user",
          color: "text-neutral-500",
        };
      case "interrupted":
        return {
          label: "Interrupted",
          icon: AlertCircle,
          variant: "warning" as const,
          description: "Execution interrupted by server restart or disconnect",
          color: "text-amber-600",
        };
      case "reconnecting":
      default:
        return {
          label: "Reconnecting...",
          icon: WifiOff,
          variant: "warning" as const,
          description: "Resynchronizing stream with gateway cursor",
          spin: true,
          color: "text-amber-600",
        };
    }
  };

  const config = getStatusConfig();
  const IconComp = config.icon;

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-white shadow-2xs",
          status === "running" && "border-blue-200 text-blue-700 bg-blue-50/50",
          status === "waiting_for_approval" && "border-amber-200 text-amber-700 bg-amber-50/50 motion-safe:animate-pulse",
          status === "reconnecting" && "border-amber-200 text-amber-700 bg-amber-50/50",
          status === "failed" && "border-rose-200 text-rose-700 bg-rose-50/50",
          status === "completed" && "border-emerald-200 text-emerald-700 bg-emerald-50/50",
          (status === "queued" || status === "cancelled") && "border-neutral-200 text-neutral-600 bg-neutral-50",
          className
        )}
        title={config.description}
        role="status"
        aria-live="polite"
      >
        <IconComp className={cn("size-3", config.spin && "motion-safe:animate-spin", config.color)} />
        <span>{config.label}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 rounded-xl border bg-white shadow-2xs text-xs",
        status === "failed" || status === "interrupted"
          ? "border-amber-200 bg-amber-50/40"
          : "border-neutral-200",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <IconComp className={cn("size-3.5", config.spin && "motion-safe:animate-spin", config.color)} />
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-neutral-800">{config.label}</span>
            {runId && (
              <span className="text-[10px] font-mono text-neutral-400">
                ({runId.slice(0, 12)})
              </span>
            )}
          </div>
          <span className="text-[11px] text-neutral-500">{config.description}</span>
        </div>
      </div>

      {(status === "interrupted" || status === "failed") && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 transition-colors shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          <RotateCcw className="size-3" />
          <span>Resume Run</span>
        </button>
      )}
    </div>
  );
}
