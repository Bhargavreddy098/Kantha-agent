"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { GatewayAccessGate, GatewaySignOut } from "@/components/gateway/gateway-access-gate";
import {
  Server,
  LifeBuoy,
  X,
  RefreshCw,
  BookOpen,
  ShieldCheck,
  Activity,
  Coins,
} from "lucide-react";
import { ModelProvidersView } from "@/components/block/model-providers-view";
import { GatewayStatusPanel } from "@/components/gateway/gateway-status-panel";
import { UsageView } from "@/components/gateway/usage-view";
import { DashboardButton } from "@/components/block/dashboard-shell";
import { cn } from "@/lib/utils";

export type SettingsSection = "model-providers" | "gateway-status" | "usage" | "help";

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: SettingsSection;
}

export function SettingsDialog({
  open,
  onOpenChange,
  initialSection = "model-providers",
}: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const focusOrigin = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const reset = setTimeout(() => setSection(initialSection), 0);
    return () => clearTimeout(reset);
  }, [open, initialSection]);

  // Help & Support state
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleRunDiagnostics = async () => {
    setDiagnosticsRunning(true);
    setDiagnosticsStatus(null);
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const data = await res.json();
        const count = Array.isArray(data.models) ? data.models.length : 0;
        setDiagnosticsStatus(`Workspace catalog returned ${count} eligible models. Test a saved connection in Model Providers to verify its provider.`);
      } else {
        setDiagnosticsStatus(`Provider returned HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (err: unknown) {
      setDiagnosticsStatus(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDiagnosticsRunning(false);
    }
  };

  const sectionMeta = {
    "model-providers": {
      title: "Model Providers",
      description: "Configure server-managed AI connections and model discovery without local keys.",
    },
    "gateway-status": {
      title: "Gateway Readiness & Health",
      description: "Monitor gateway readiness and component health.",
    },
    usage: {
      title: "Usage & Allowances",
      description: "Review token consumption, daily budget allowances, and accounting ledger.",
    },
    help: {
      title: "Help & Support",
      description: "System diagnostics, developer guides, and troubleshooting resources.",
    },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={() => {
          focusOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (!focusOrigin.current?.isConnected) return;
          event.preventDefault();
          focusOrigin.current.focus();
        }}
        className="obsidian-dashboard-shell-layer max-w-5xl w-[95vw] h-[720px] max-h-[90vh] p-0 gap-0 overflow-hidden rounded-2xl md:rounded-3xl border border-gray-200 bg-white text-gray-900 shadow-2xl shadow-black/25 focus:outline-none"
      >
        <div className="flex h-full w-full flex-col overflow-hidden md:flex-row">
          {/* Left Sidebar Navigation - Crisp Light Surface */}
          <aside className="flex shrink-0 flex-col justify-between border-b border-gray-200 bg-[#f8f9fa] p-2 md:w-64 md:border-r md:border-b-0 md:p-4">
            <div className="space-y-3">
              {/* Header */}
              <div className="hidden px-3 pt-2 pb-1 md:block">
                <span className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
                  Settings
                </span>
              </div>

              {/* Navigation Items */}
              <nav className="grid grid-cols-4 gap-1 md:flex md:flex-col" aria-label="Settings sections">
                {[
                  {
                    id: "model-providers" as const,
                    label: "Model Providers",
                    icon: Server,
                  },
                  {
                    id: "gateway-status" as const,
                    label: "Gateway Status",
                    icon: Activity,
                  },
                  {
                    id: "usage" as const,
                    label: "Usage & Limits",
                    icon: Coins,
                  },
                  {
                    id: "help" as const,
                    label: "Help & Support",
                    icon: LifeBuoy,
                  },
                ].map((item) => {
                  const IconComp = item.icon;
                  const isActive = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSection(item.id)}
                      aria-pressed={isActive}
                      aria-label={item.label}
                      className={cn(
                        "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl p-2 text-center text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-gray-400 md:flex-row md:justify-start md:gap-2 md:px-3.5 md:py-2.5 md:text-left",
                        isActive
                          ? "bg-gray-200/90 text-gray-900 font-semibold shadow-xs border border-gray-300/70"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50"
                      )}
                    >
                      <IconComp
                        className={cn(
                          "size-4 shrink-0",
                          isActive ? "text-blue-600" : "text-gray-400"
                        )}
                      />
                      <span className="leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Right Main Content Area - Solid Light Panel */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white text-gray-900">
            {/* Header with Title, Description, and the Single Close Button */}
            <div className="flex shrink-0 items-start justify-between border-b border-gray-200 px-4 pt-4 pb-3 md:px-8 md:pt-7 md:pb-4">
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-bold tracking-tight text-gray-900">
                  {sectionMeta[section].title}
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500">
                  {sectionMeta[section].description}
                </DialogDescription>
              </div>

              {/* Single Dialog Close Button */}
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label="Close settings"
                  className="flex size-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gray-400 cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </DialogClose>
            </div>

            {/* Scrollable Content Body */}
            <div className="obsidian-dashboard-shell-scroll flex-1 space-y-6 overflow-y-auto bg-white px-4 py-4 md:px-8 md:py-6">
              <GatewayAccessGate>
                <div className="mb-3 flex justify-end"><GatewaySignOut /></div>
                {/* SECTION 1: Model Providers */}
                {section === "model-providers" && (
                  <div className="w-full">
                    <ModelProvidersView
                      showBackButton={false}
                    />
                  </div>
                )}

                {/* SECTION 2: Gateway Status */}
                {section === "gateway-status" && (
                  <div className="w-full">
                    <GatewayStatusPanel />
                  </div>
                )}

                {/* SECTION 3: Usage & Allowances */}
                {section === "usage" && (
                  <div className="w-full">
                    <UsageView />
                  </div>
                )}

                {/* SECTION 4: Help & Support */}
                {section === "help" && (
                  <div className="space-y-6 max-w-3xl">
                    {/* System Health */}
                    <Card className="rounded-xl border border-gray-200 bg-[#f9fafb] p-5 space-y-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-200/80">
                            <ShieldCheck className="size-4 text-emerald-600" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">
                              System Status & Diagnostics
                            </h3>
                            <p className="text-xs text-gray-500">
                              Check the workspace model catalog.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-1">
                        <DashboardButton
                          variant="secondary"
                          size="sm"
                          onClick={handleRunDiagnostics}
                          disabled={diagnosticsRunning}
                        >
                          <RefreshCw className={cn("size-3.5 mr-1.5", diagnosticsRunning && "animate-spin")} />
                          {diagnosticsRunning ? "Running Diagnostics..." : "Check model catalog"}
                        </DashboardButton>
                        {diagnosticsStatus && (
                          <p className="mt-2 text-xs font-mono p-2 rounded bg-gray-100 border border-gray-200 text-gray-800">
                            {diagnosticsStatus}
                          </p>
                        )}
                      </div>
                    </Card>

                    {/* Guides */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        {
                          title: "Gateway Architecture Guide",
                          description: "Understand the OpenCode gateway ingress, location scoping, and adapter isolation.",
                          icon: BookOpen,
                        },
                        {
                          title: "Vercel AI SDK Integration",
                          description: "Learn how streaming UI messages, reasoning parts, and cancellation tokens interact.",
                          icon: Server,
                        },
                      ].map((guide, idx) => {
                        const IconComp = guide.icon;
                        return (
                          <Card
                            key={idx}
                            className="rounded-xl border border-gray-200 bg-[#f9fafb] p-4 space-y-2 transition-shadow hover:shadow-sm hover:border-gray-300"
                          >
                            <div className="flex size-7 items-center justify-center rounded-lg bg-gray-200/70">
                              <IconComp className="size-3.5 text-gray-700" />
                            </div>
                            <h4 className="text-xs font-semibold text-gray-900">
                              {guide.title}
                            </h4>
                            <p className="text-[11px] text-gray-600 leading-relaxed">
                              {guide.description}
                            </p>
                          </Card>
                        );
                      })}
                    </div>

                    {/* FAQ Accordion */}
                    <Card className="rounded-xl border border-gray-200 bg-[#f9fafb] p-5 space-y-3 shadow-xs">
                      <h3 className="text-sm font-semibold text-gray-900">
                        Frequently Asked Questions
                      </h3>

                      <div className="space-y-2 pt-1">
                        {[
                          {
                            q: "How are provider credentials protected?",
                            a: "Credentials are saved in the server’s secret store. The browser uses an authenticated session to access available models.",
                          },
                          {
                            q: "How does the gateway handle readiness during boot?",
                            a: "During initialization or maintenance drains, /api/gateway/health/ready responds with HTTP 503 and a Retry-After hint to prevent partial request failures.",
                          },
                          {
                            q: "What happens if a tool requires approval?",
                            a: "When a tool action requires approval, the run enters waiting_for_approval and an approval card appears with Approve and Reject actions.",
                          },
                        ].map((item, idx) => (
                          <div
                            key={idx}
                            className="border border-gray-200 bg-white rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-800">
                                {item.q}
                              </span>
                              <span className="text-xs text-gray-500 font-semibold">
                                {openFaq === idx ? "−" : "+"}
                              </span>
                            </div>
                            {openFaq === idx && (
                              <p className="mt-2 text-xs text-gray-600 border-t border-gray-100 pt-2">
                                {item.a}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>

                  </div>
                )}
              </GatewayAccessGate>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
