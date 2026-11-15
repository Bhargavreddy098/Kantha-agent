"use client";

import { useState } from "react";
import { DashboardShell, DashboardButton } from "@/components/block/dashboard-shell";
import { navigation, secondaryNavigation } from "@/components/block/dashboard-shell-config";
import { ModelProvidersView } from "@/components/block/model-providers-view";
import { GatewayStatusPanel } from "@/components/gateway/gateway-status-panel";
import { UsageView } from "@/components/gateway/usage-view";
import { Card } from "@/components/ui/card";
import { GatewayAccessGate, GatewaySignOut } from "@/components/gateway/gateway-access-gate";
import {
  Server,
  LifeBuoy,
  RefreshCw,
  BookOpen,
  ShieldCheck,
  MessageCircle,
  Activity,
  Coins,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type SettingsTab = "model-providers" | "gateway-status" | "usage" | "help";

export default function SettingsPage() {
  return <GatewayAccessGate><GatewaySettings /></GatewayAccessGate>;
}

function GatewaySettings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("model-providers");
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
        const count = Array.isArray(data.models)
          ? data.models.length
          : Array.isArray(data.data)
          ? data.data.length
          : 0;
        setDiagnosticsStatus(`Workspace catalog returned ${count} eligible models. Test a saved connection in Model Providers to verify its provider.`);
      } else {
        setDiagnosticsStatus(`Provider endpoint returned HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (err: unknown) {
      setDiagnosticsStatus(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDiagnosticsRunning(false);
    }
  };

  return (
    <DashboardShell
      brand={{ name: "ObsidianUI", description: "AI Chat Control Plane" }}
      navigation={navigation}
      secondaryNavigation={secondaryNavigation}
      activeItemId="settings"
      title="Settings"
      sidebarWidth={240}
      defaultSidebarWidth={240}
      linkComponent={Link}
    >
      <div className="flex flex-col h-[calc(100vh-80px)] max-w-6xl mx-auto p-4 md:p-6 w-full gap-6">
        {/* Top Header */}
        <div className="flex flex-col gap-1 pb-4 border-b border-(--obsidian-dashboard-shell-border)">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-(--obsidian-dashboard-shell-foreground)">
              Settings
            </h1>
            <div className="ml-auto"><GatewaySignOut /></div>
          </div>
          <p className="text-xs text-(--obsidian-dashboard-shell-text-muted)">
            Manage your AI model providers, gateway readiness, usage budgets, and diagnostic tools.
          </p>

          {/* Section Navigation Tabs */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab("model-providers")}
              aria-pressed={activeTab === "model-providers"}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                activeTab === "model-providers"
                  ? "bg-neutral-900 text-white shadow-xs"
                  : "bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/80"
              )}
            >
              <Server className="size-3.5" />
              <span>Model Providers</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("gateway-status")}
              aria-pressed={activeTab === "gateway-status"}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                activeTab === "gateway-status"
                  ? "bg-neutral-900 text-white shadow-xs"
                  : "bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/80"
              )}
            >
              <Activity className="size-3.5" />
              <span>Gateway Status</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("usage")}
              aria-pressed={activeTab === "usage"}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                activeTab === "usage"
                  ? "bg-neutral-900 text-white shadow-xs"
                  : "bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/80"
              )}
            >
              <Coins className="size-3.5" />
              <span>Usage & Limits</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("help")}
              aria-pressed={activeTab === "help"}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                activeTab === "help"
                  ? "bg-neutral-900 text-white shadow-xs"
                  : "bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/80"
              )}
            >
              <LifeBuoy className="size-3.5" />
              <span>Help & Diagnostics</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto obsidian-dashboard-shell-scroll pr-1">
          {activeTab === "model-providers" && (
            <div className="w-full">
              <ModelProvidersView showBackButton={false} />
            </div>
          )}

          {activeTab === "gateway-status" && (
            <div className="w-full">
              <GatewayStatusPanel />
            </div>
          )}

          {activeTab === "usage" && (
            <div className="w-full">
              <UsageView />
            </div>
          )}

          {activeTab === "help" && (
            <div className="space-y-6 max-w-4xl">
              {/* System Health */}
              <Card className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-200/80">
                      <ShieldCheck className="size-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900">
                        System Status & Diagnostics
                      </h3>
                      <p className="text-xs text-neutral-500">
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
                    <p className="mt-3 text-xs font-mono p-3 rounded-lg bg-white border border-neutral-200 text-neutral-800 shadow-2xs">
                      {diagnosticsStatus}
                    </p>
                  )}
                </div>
              </Card>

              {/* Architecture Guides */}
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    title: "Gateway Architecture Guide",
                    description: "Understand OpenCode gateway ingress, location scoping, and adapter isolation.",
                    icon: BookOpen,
                  },
                  {
                    title: "Vercel AI SDK Integration",
                    description: "Understand model routing, dynamic model fetching, and streaming SSE endpoints.",
                    icon: Server,
                  },
                ].map((guide, idx) => {
                  const IconComp = guide.icon;
                  return (
                    <Card
                      key={idx}
                      className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2 transition-shadow hover:shadow-xs hover:border-neutral-300"
                    >
                      <div className="flex size-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                        <IconComp className="size-4" />
                      </div>
                      <h4 className="text-xs font-semibold text-neutral-900">
                        {guide.title}
                      </h4>
                      <p className="text-[11px] text-neutral-600 leading-relaxed">
                        {guide.description}
                      </p>
                    </Card>
                  );
                })}
              </div>

              {/* FAQ Section */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Frequently Asked Questions
                </h3>
                <div className="space-y-2">
                  {[
                    {
                      q: "How does the Vercel AI SDK route requests?",
                      a: "Requests are streamed via Vercel AI SDK through /api/chat to the server gateway, resolving model credentials securely without browser-stored keys.",
                    },
                    {
                      q: "Where are provider API keys stored?",
                      a: "Keys set in Model Providers are stored exclusively in the server-side secret store. No keys are ever written to browser localStorage.",
                    },
                    {
                      q: "What happens when a provider is unavailable?",
                      a: "Chat shows the failure. You can choose another configured model or restore your draft and try again."
                    },
                  ].map((faq, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-neutral-200 bg-white p-3.5 transition-colors cursor-pointer"
                      onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    >
                      <div className="flex items-center justify-between text-xs font-medium text-neutral-800">
                        <span className="flex items-center gap-2">
                          <MessageCircle className="size-3.5 text-neutral-400" />
                          {faq.q}
                        </span>
                        <span className="text-neutral-400 font-mono text-xs">
                          {openFaq === idx ? "−" : "+"}
                        </span>
                      </div>
                      {openFaq === idx && (
                        <p className="mt-2 text-xs text-neutral-600 leading-relaxed pl-5.5 border-t border-neutral-100 pt-2">
                          {faq.a}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
