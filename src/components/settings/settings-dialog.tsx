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
import { GatewayAccessGate, GatewaySignOut } from "@/components/gateway/gateway-access-gate";
import {
  Server,
  LifeBuoy,
  X,
  Activity,
  Coins,
} from "lucide-react";
import { SettingsContent, type SettingsSection } from "./settings-content";
import { cn } from "@/lib/utils";

export type { SettingsSection };

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

  const handleOpenAutoFocus = React.useCallback(() => {
    focusOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const handleCloseAutoFocus = React.useCallback((event: { preventDefault: () => void }) => {
    if (!focusOrigin.current?.isConnected) return;
    event.preventDefault();
    focusOrigin.current.focus();
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        className="max-w-5xl w-[95vw] h-[720px] max-h-[90vh] p-0 gap-0 overflow-hidden rounded-[10px] border border-[#0000001a] bg-[#ffffff] text-[#0d0d0d] shadow-none focus:outline-none"
      >
        <div className="flex h-full w-full flex-col overflow-hidden md:flex-row">
          {/* Left Sidebar Navigation - Sidebar Mist (#f9f9f9) Surface */}
          <aside className="flex shrink-0 flex-col justify-between border-b border-[#0000001a] bg-[#f9f9f9] p-2 md:w-64 md:border-r md:border-b-0 md:p-3">
            <div className="space-y-3">
              {/* Header */}
              <div className="hidden px-2 pt-1 pb-1 md:block">
                <span className="text-[11px] font-semibold tracking-wider text-[#8f8f8f] uppercase">
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
                        "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] p-2 text-center text-[13px] transition-colors md:flex-row md:justify-start md:gap-2 md:px-2.5 md:py-2 md:text-left",
                        isActive
                          ? "bg-[#0000000d] text-[#0d0d0d] font-medium"
                          : "text-[#5d5d5d] hover:text-[#0d0d0d] hover:bg-[#0000000d]"
                      )}
                    >
                      <IconComp
                        className={cn(
                          "size-5 shrink-0 stroke-[1.8]",
                          isActive ? "text-[#0d0d0d]" : "text-[#5d5d5d]"
                        )}
                      />
                      <span className="leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Right Main Content Area - Pure White Panel */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#ffffff] text-[#0d0d0d]">
            {/* Header with Title, Description, and the Single Close Button */}
            <div className="flex shrink-0 items-start justify-between border-b border-[#0000001a] px-4 pt-4 pb-3 md:px-6 md:pt-6 md:pb-4">
              <div className="space-y-1">
                <DialogTitle className="text-[20px] font-semibold tracking-tight text-[#0d0d0d]">
                  {sectionMeta[section].title}
                </DialogTitle>
                <DialogDescription className="text-[13px] leading-[1.43] text-[#5d5d5d]">
                  {sectionMeta[section].description}
                </DialogDescription>
              </div>

              {/* Single Dialog Close Button */}
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label="Close settings"
                  className="flex size-9 items-center justify-center rounded-[10px] text-[#0d0d0d] hover:bg-[#0000000d] transition-colors outline-none cursor-pointer"
                >
                  <X className="size-5 stroke-[2]" />
                </button>
              </DialogClose>
            </div>

            {/* Scrollable Content Body */}
            <div className="obsidian-dashboard-shell-scroll flex-1 space-y-6 overflow-y-auto bg-white px-4 py-4 md:px-8 md:py-6">
              <GatewayAccessGate>
                <div className="mb-3 flex justify-end"><GatewaySignOut /></div>
                <SettingsContent activeSection={section} />
              </GatewayAccessGate>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
