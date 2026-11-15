"use client";

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@astryxdesign/core/Badge";
import { DashboardButton } from "@/components/block/dashboard-shell";
import { gatewayMessage } from "./gateway-client";
import {
  ShieldAlert,
  Check,
  X,
  Clock,
  Terminal,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GatewayApproval } from "@/lib/gateway/contracts/approval";

export interface ApprovalPanelProps {
  approval: GatewayApproval;
  onResolve: (approvalId: string, decision: "approve" | "reject", actionVersion: number) => Promise<void>;
  className?: string;
}

export function ApprovalPanel({
  approval,
  onResolve,
  className,
}: ApprovalPanelProps) {
  const [deciding, setDeciding] = useState<boolean>(false);
  const status = deciding ? "deciding" : approval.status;
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const handleDecision = useCallback(
    async (decision: "approve" | "reject") => {
      if (deciding || status !== "waiting") return;
      setDeciding(true);
      setErrorNotice(null);
      try {
        await onResolve(approval.id, decision, approval.actionVersion);
      } catch (err: unknown) {
        setErrorNotice(gatewayMessage(err, "Could not confirm the decision. Try again after checking its status."));
      } finally {
        setDeciding(false);
      }
    },
    [approval, deciding, onResolve, status]
  );

  const isPending = status === "waiting" || status === "deciding";

  const getStatusBadge = () => {
    switch (status) {
      case "approved":
        return <Badge variant="success" label="Approved" />;
      case "rejected":
        return <Badge variant="error" label="Rejected" />;
      case "expired":
        return <Badge variant="neutral" label="Expired" />;
      case "interrupted":
        return <Badge variant="warning" label="Interrupted" />;
      case "deciding":
        return <Badge variant="info" label="Submitting..." />;
      case "waiting":
      default:
        return <Badge variant="warning" label="Pending Action" />;
    }
  };

  return (
    <Card
      className={cn(
        "rounded-2xl border transition-all overflow-hidden",
        isPending
          ? "border-amber-300/80 bg-amber-50/30 shadow-md shadow-amber-900/5 ring-1 ring-amber-400/30"
          : "border-neutral-200 bg-white shadow-2xs",
        className
      )}
      role="region"
      aria-label={`Tool Approval Request: ${approval.toolName}`}
    >
      <CardHeader className="p-4 pb-3 border-b border-amber-200/50 bg-amber-50/60 flex flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-amber-100 text-amber-800 shrink-0 mt-0.5">
            <ShieldAlert className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-xs font-bold text-neutral-900 font-mono">
                {approval.toolName}
              </CardTitle>
              {getStatusBadge()}
              <span className="text-[10px] text-neutral-400 font-mono">
                v{approval.actionVersion}
              </span>
            </div>
            <CardDescription className="text-xs text-neutral-600 mt-1 font-medium">
              {approval.summary}
            </CardDescription>
          </div>
        </div>

        <div className="text-[10px] text-neutral-400 font-mono flex items-center gap-1 shrink-0">
          <Clock className="size-3 text-neutral-400" />
          <span>Expires {new Date(approval.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {errorNotice && (
          <div role="alert" className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertTriangle className="size-3.5 text-rose-600 shrink-0" />
            <span>{errorNotice}</span>
          </div>
        )}

        {/* Parameters Preview */}
        {approval.parameters && Object.keys(approval.parameters).length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Terminal className="size-3 text-neutral-400" />
                Execution Parameters
              </span>
            </div>

            <pre className="p-3 rounded-xl bg-neutral-900 text-neutral-100 text-xs font-mono overflow-x-auto max-h-48 border border-neutral-800 shadow-inner">
              <code>{JSON.stringify(approval.parameters, null, 2)}</code>
            </pre>
          </div>
        )}

        {/* Audit footer details */}
        <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono pt-1">
          <span>Run: {approval.runId.slice(0, 14)}...</span>
          <span>Created: {new Date(approval.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </CardContent>

      {/* Decision Actions: Only accessible when waiting */}
      {isPending && (
        <CardFooter className="p-3 bg-neutral-50/80 border-t border-neutral-100 flex items-center justify-end gap-2">
          <DashboardButton variant="secondary" size="sm" disabled={deciding} onClick={() => void handleDecision("reject")}>
            {deciding ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            <span>Reject Tool</span>
          </DashboardButton>

          <DashboardButton variant="primary" size="sm" disabled={deciding} onClick={() => void handleDecision("approve")}>
            {deciding ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            <span>Approve & Execute</span>
          </DashboardButton>
        </CardFooter>
      )}

      {!isPending && (
        <div role="status" className="px-4 py-2.5 bg-neutral-50/80 border-t border-neutral-100 text-xs text-neutral-500 flex items-center justify-between">
          <span>Action version {approval.actionVersion}</span>
          <span className="font-semibold capitalize text-neutral-700">{status}</span>
        </div>
      )}
    </Card>
  );
}
