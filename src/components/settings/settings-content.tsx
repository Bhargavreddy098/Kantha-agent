"use client";

import { useState } from "react";
import { ModelProvidersView } from "./model-providers-view";
import { GatewayStatusPanel } from "@/components/gateway/gateway-status-panel";
import { UsageView } from "@/components/gateway/usage-view";
import { Card } from "@/components/ui/card";
import { gatewayRequest } from "@/lib/gateway/client";
import {
  Server,
  BookOpen,
  ShieldCheck,
  RefreshCw,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsSection = "model-providers" | "gateway-status" | "usage" | "help";

export interface SettingsContentProps {
  activeSection: SettingsSection;
  className?: string;
}

const ARCHITECTURE_GUIDES = [
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
];

const FAQ_ITEMS = [
  {
    q: "How are provider credentials protected?",
    a: "Keys set in Model Providers are stored exclusively in the server-side secret store. No keys are ever written to browser localStorage.",
  },
  {
    q: "How does the Vercel AI SDK route requests?",
    a: "Requests are streamed via Vercel AI SDK through /api/chat to the server gateway, resolving model credentials securely without browser-stored keys.",
  },
  {
    q: "How does the gateway handle readiness during boot?",
    a: "During initialization or maintenance drains, /api/gateway/health/ready responds with HTTP 503 and a Retry-After hint to prevent partial request failures.",
  },
  {
    q: "What happens if a tool requires approval?",
    a: "When a tool action requires approval, the run enters waiting_for_approval and an approval card appears with Approve and Reject actions.",
  },
  {
    q: "What happens when a provider is unavailable?",
    a: "Chat shows the failure. You can choose another configured model or restore your draft and try again.",
  },
];

export function SettingsContent({ activeSection, className }: SettingsContentProps) {
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleRunDiagnostics = async () => {
    setDiagnosticsRunning(true);
    setDiagnosticsStatus(null);
    try {
      const data = await gatewayRequest<{ models?: string[]; data?: unknown[] }>("/api/models");
      const count = Array.isArray(data.models)
        ? data.models.length
        : Array.isArray(data.data)
        ? data.data.length
        : 0;
      setDiagnosticsStatus(`Workspace catalog returned ${count} eligible models. Test a saved connection in Model Providers to verify its provider.`);
    } catch (err: unknown) {
      setDiagnosticsStatus(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDiagnosticsRunning(false);
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {activeSection === "model-providers" && (
        <div className="w-full">
          <ModelProvidersView showBackButton={false} />
        </div>
      )}

      {activeSection === "gateway-status" && (
        <div className="w-full">
          <GatewayStatusPanel />
        </div>
      )}

      {activeSection === "usage" && (
        <div className="w-full">
          <UsageView />
        </div>
      )}

      {activeSection === "help" && (
        <div className="space-y-6 max-w-4xl">
          {/* System Status & Diagnostics */}
          <Card className="rounded-[10px] border border-[#0000001a] bg-[#ffffff] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-[10px] bg-[#0000000d] text-[#0d0d0d]">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[#0d0d0d]">
                    System Status & Diagnostics
                  </h3>
                  <p className="text-[12px] text-[#8f8f8f]">
                    Check the workspace model catalog.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleRunDiagnostics}
                disabled={diagnosticsRunning}
                className="flex items-center gap-2 rounded-[10px] border border-[#0000001a] bg-[#f9f9f9] px-3 py-1.5 text-[13px] font-medium text-[#0d0d0d] hover:bg-[#0000000d] transition-colors focus:outline-none disabled:opacity-50"
              >
                <RefreshCw className={cn("size-4 stroke-[1.8]", diagnosticsRunning && "animate-spin")} />
                <span>{diagnosticsRunning ? "Running Diagnostics..." : "Check model catalog"}</span>
              </button>
              {diagnosticsStatus && (
                <p className="mt-3 text-[12px] font-mono p-3 rounded-[10px] bg-[#f9f9f9] border border-[#0000001a] text-[#5d5d5d]">
                  {diagnosticsStatus}
                </p>
              )}
            </div>
          </Card>

          {/* Architecture Guides */}
          <div className="grid gap-4 sm:grid-cols-2">
            {ARCHITECTURE_GUIDES.map((guide, idx) => {
              const IconComp = guide.icon;
              return (
                <Card
                  key={idx}
                  className="rounded-[10px] border border-[#0000001a] bg-[#ffffff] p-4 space-y-2 hover:bg-[#0000000d] transition-colors"
                >
                  <div className="flex size-9 items-center justify-center rounded-[10px] bg-[#0000000d] text-[#0d0d0d]">
                    <IconComp className="size-5 stroke-[1.8]" />
                  </div>
                  <h4 className="text-[13px] font-semibold text-[#0d0d0d]">
                    {guide.title}
                  </h4>
                  <p className="text-[12px] text-[#5d5d5d] leading-relaxed">
                    {guide.description}
                  </p>
                </Card>
              );
            })}
          </div>

          {/* FAQ Section */}
          <div className="space-y-3 pt-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#8f8f8f]">
              Frequently Asked Questions
            </h3>
            <div className="space-y-2">
              {FAQ_ITEMS.map((faq, idx) => (
                <div
                  key={idx}
                  className="rounded-[10px] border border-[#0000001a] bg-[#ffffff] p-3.5 transition-colors cursor-pointer hover:bg-[#0000000d]"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                >
                  <div className="flex items-center justify-between text-[13px] font-medium text-[#0d0d0d]">
                    <span className="flex items-center gap-2">
                      <MessageCircle className="size-4.5 text-[#5d5d5d] stroke-[1.8]" />
                      {faq.q}
                    </span>
                    <span className="text-[#8f8f8f] font-mono text-[13px]">
                      {openFaq === idx ? "−" : "+"}
                    </span>
                  </div>
                  {openFaq === idx && (
                    <p className="mt-2 text-[12px] text-[#5d5d5d] leading-relaxed pl-5.5 border-t border-[#0000001a] pt-2">
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
  );
}
