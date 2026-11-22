import React, { useState } from "react";
import { Dialog, DialogHeader, Button, IconButton } from "@astryxdesign/core";
import {
  X,
  Cpu,
  Palette,
  Database,
  ShieldCheck,
  Check,
  Sun,
  Moon,
  Trash2,
  HardDrive,
  Radio,
} from "lucide-react";
import type { ThemeMode } from "../theme/swissTheme";

export interface ProviderModel {
  id: string;
  name: string;
}

export interface ProviderItem {
  id: string;
  name: string;
  configured: boolean;
  models: ProviderModel[];
}

export interface ProvidersResponse {
  defaultModel: string;
  providers: ProviderItem[];
}

export interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  providersData: ProvidersResponse | null;
  onClearHistory: () => Promise<void>;
  conversationCount: number;
  messageCount: number;
  isDaemonOnline: boolean;
}

type SettingsTab = "models" | "appearance" | "storage" | "connection";

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  themeMode,
  onToggleTheme,
  selectedModel,
  onSelectModel,
  providersData,
  onClearHistory,
  conversationCount,
  messageCount,
  isDaemonOnline,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("models");
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      await onClearHistory();
      setIsConfirmingClear(false);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setIsConfirmingClear(false);
          onClose();
        }
      }}
      width={600}
      purpose="info"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--swiss-surface)",
          color: "var(--swiss-text)",
          borderRadius: "8px",
          overflow: "hidden",
          maxHeight: "85vh",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--swiss-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "10px",
                height: "10px",
                backgroundColor: "var(--swiss-accent)",
              }}
            />
            <span
              style={{
                fontSize: "14px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Workbench Settings
            </span>
          </div>

          <IconButton
            icon={<X size={16} />}
            label="Close"
            variant="ghost"
            size="sm"
            onClick={onClose}
          />
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--swiss-border)",
            backgroundColor: "var(--swiss-bg)",
            padding: "0 12px",
            gap: "4px",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("models")}
            style={{
              padding: "10px 14px",
              border: "none",
              background: "none",
              borderBottom: activeTab === "models" ? "2px solid var(--swiss-accent)" : "2px solid transparent",
              color: activeTab === "models" ? "var(--swiss-text)" : "var(--swiss-text-secondary)",
              fontWeight: activeTab === "models" ? 600 : 500,
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              letterSpacing: "0.02em",
            }}
          >
            <Cpu size={14} />
            <span>Models & Providers</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("appearance")}
            style={{
              padding: "10px 14px",
              border: "none",
              background: "none",
              borderBottom: activeTab === "appearance" ? "2px solid var(--swiss-accent)" : "2px solid transparent",
              color: activeTab === "appearance" ? "var(--swiss-text)" : "var(--swiss-text-secondary)",
              fontWeight: activeTab === "appearance" ? 600 : 500,
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              letterSpacing: "0.02em",
            }}
          >
            <Palette size={14} />
            <span>Appearance</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("storage")}
            style={{
              padding: "10px 14px",
              border: "none",
              background: "none",
              borderBottom: activeTab === "storage" ? "2px solid var(--swiss-accent)" : "2px solid transparent",
              color: activeTab === "storage" ? "var(--swiss-text)" : "var(--swiss-text-secondary)",
              fontWeight: activeTab === "storage" ? 600 : 500,
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              letterSpacing: "0.02em",
            }}
          >
            <Database size={14} />
            <span>Storage & Data</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("connection")}
            style={{
              padding: "10px 14px",
              border: "none",
              background: "none",
              borderBottom: activeTab === "connection" ? "2px solid var(--swiss-accent)" : "2px solid transparent",
              color: activeTab === "connection" ? "var(--swiss-text)" : "var(--swiss-text-secondary)",
              fontWeight: activeTab === "connection" ? 600 : 500,
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              letterSpacing: "0.02em",
            }}
          >
            <ShieldCheck size={14} />
            <span>Security & Session</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
          {activeTab === "models" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                  Active Chat Model
                </div>
                <div style={{ fontSize: "12px", color: "var(--swiss-text-secondary)", marginBottom: "12px" }}>
                  Select the AI model used for generating responses and executing tasks.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {providersData?.providers?.flatMap((provider) =>
                    provider.models.map((m) => {
                      const fullModelId = `${provider.id}:${m.id}`;
                      const isSelected = selectedModel === fullModelId || selectedModel === m.id;
                      return (
                        <div
                          key={fullModelId}
                          onClick={() => onSelectModel(fullModelId)}
                          style={{
                            padding: "10px 14px",
                            border: `1px solid ${isSelected ? "var(--swiss-accent)" : "var(--swiss-border)"}`,
                            backgroundColor: isSelected ? "var(--swiss-hover)" : "var(--swiss-bg)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            transition: "all 120ms ease",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: isSelected ? 600 : 500, color: "var(--swiss-text)" }}>
                              {m.name}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--swiss-text-secondary)", marginTop: "2px" }}>
                              Provider: {provider.name} {provider.configured ? "● Active" : "○ Not Configured"}
                            </div>
                          </div>

                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              border: `1px solid ${isSelected ? "var(--swiss-accent)" : "var(--swiss-border)"}`,
                              backgroundColor: isSelected ? "var(--swiss-accent)" : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {isSelected && <Check size={10} color="#FFFFFF" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--swiss-border)", paddingTop: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--swiss-text-secondary)", marginBottom: "8px" }}>
                  Daemon Discovered Providers
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {providersData?.providers?.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        backgroundColor: "var(--swiss-bg)",
                        fontSize: "12px",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: p.configured ? "#10B981" : "var(--swiss-text-secondary)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: p.configured ? "#10B981" : "var(--swiss-text-secondary)",
                          }}
                        />
                        {p.configured ? "Configured" : "Unconfigured"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                  Interface Theme
                </div>
                <div style={{ fontSize: "12px", color: "var(--swiss-text-secondary)", marginBottom: "14px" }}>
                  Switch between high-contrast light canvas and deep neutral dark mode.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div
                    onClick={() => {
                      if (themeMode !== "light") onToggleTheme();
                    }}
                    style={{
                      padding: "16px",
                      border: `2px solid ${themeMode === "light" ? "var(--swiss-accent)" : "var(--swiss-border)"}`,
                      backgroundColor: "#F8F8F6",
                      color: "#171717",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      borderRadius: "4px",
                    }}
                  >
                    <Sun size={20} color="#E53935" />
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>Swiss Light</span>
                    <span style={{ fontSize: "11px", color: "#737373" }}>Warm canvas, crisp black text</span>
                  </div>

                  <div
                    onClick={() => {
                      if (themeMode !== "dark") onToggleTheme();
                    }}
                    style={{
                      padding: "16px",
                      border: `2px solid ${themeMode === "dark" ? "var(--swiss-accent)" : "var(--swiss-border)"}`,
                      backgroundColor: "#1F1F1F",
                      color: "#F5F5F5",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      borderRadius: "4px",
                    }}
                  >
                    <Moon size={20} color="#E53935" />
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>Swiss Dark</span>
                    <span style={{ fontSize: "11px", color: "#A3A3A3" }}>Deep neutral, white text</span>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--swiss-border)", paddingTop: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--swiss-text-secondary)", marginBottom: "6px" }}>
                  Design Philosophy
                </div>
                <p style={{ fontSize: "12px", color: "var(--swiss-text-secondary)", lineHeight: 1.6, margin: 0 }}>
                  Kantha adheres to the International Typographic Style: mathematical hierarchy, generous white space, restrained functional accents, and zero artificial gradients or bloated decorations.
                </p>
              </div>
            </div>
          )}

          {activeTab === "storage" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                  Local Storage (IndexedDB)
                </div>
                <div style={{ fontSize: "12px", color: "var(--swiss-text-secondary)", marginBottom: "14px" }}>
                  Chat history, attachments, and model reasoning are stored 100% locally in your browser via Dexie.js.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                  <div style={{ padding: "12px", backgroundColor: "var(--swiss-bg)", border: "1px solid var(--swiss-border)" }}>
                    <div style={{ fontSize: "11px", color: "var(--swiss-text-secondary)", textTransform: "uppercase" }}>Saved Threads</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "4px" }}>{conversationCount}</div>
                  </div>
                  <div style={{ padding: "12px", backgroundColor: "var(--swiss-bg)", border: "1px solid var(--swiss-border)" }}>
                    <div style={{ fontSize: "11px", color: "var(--swiss-text-secondary)", textTransform: "uppercase" }}>Stored Messages</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "4px" }}>{messageCount}</div>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--swiss-border)", paddingTop: "16px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Danger Zone</div>
                  <div style={{ fontSize: "12px", color: "var(--swiss-text-secondary)", marginBottom: "12px" }}>
                    Permanently delete all locally stored conversation history and cached attachments.
                  </div>

                  {!isConfirmingClear ? (
                    <Button
                      label="Clear all conversation history"
                      variant="destructive"
                      size="sm"
                      onClick={() => setIsConfirmingClear(true)}
                      style={{
                        backgroundColor: "#DC2626",
                        color: "#FFFFFF",
                        border: "none",
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: "8px 14px",
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={14} style={{ marginRight: "6px", display: "inline" }} />
                      Clear All History
                    </Button>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Button
                        label="Confirm Delete"
                        variant="destructive"
                        size="sm"
                        isDisabled={isClearing}
                        onClick={handleClearHistory}
                        style={{
                          backgroundColor: "#991B1B",
                          color: "#FFFFFF",
                          border: "none",
                          fontSize: "12px",
                          fontWeight: 600,
                          padding: "8px 14px",
                          cursor: "pointer",
                        }}
                      >
                        {isClearing ? "Clearing..." : "Yes, Delete Everything"}
                      </Button>
                      <Button
                        label="Cancel"
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsConfirmingClear(false)}
                        style={{
                          fontSize: "12px",
                          padding: "8px 14px",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "connection" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                  Daemon Connection & Security (ADR-007)
                </div>
                <div style={{ fontSize: "12px", color: "var(--swiss-text-secondary)", marginBottom: "14px" }}>
                  Kantha uses automatic local session authentication and strict origin fencing without cloud tokens.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px", backgroundColor: "var(--swiss-bg)", fontSize: "12px" }}>
                    <span style={{ color: "var(--swiss-text-secondary)" }}>Daemon Connection Status:</span>
                    <span style={{ fontWeight: 600, color: isDaemonOnline ? "#10B981" : "#EF4444" }}>
                      {isDaemonOnline ? "Connected & Healthy" : "Offline / Standalone"}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px", backgroundColor: "var(--swiss-bg)", fontSize: "12px" }}>
                    <span style={{ color: "var(--swiss-text-secondary)" }}>Dual Ingress Fencing:</span>
                    <span style={{ fontWeight: 600 }}>Active (Fail-Closed Loopback)</span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px", backgroundColor: "var(--swiss-bg)", fontSize: "12px" }}>
                    <span style={{ color: "var(--swiss-text-secondary)" }}>Session Cookie Mode:</span>
                    <span style={{ fontWeight: 600 }}>HttpOnly, SameSite=Strict</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--swiss-border)",
            display: "flex",
            justifyContent: "flex-end",
            backgroundColor: "var(--swiss-bg)",
          }}
        >
          <Button
            label="Close"
            variant="primary"
            size="sm"
            onClick={onClose}
            style={{
              backgroundColor: "var(--swiss-text)",
              color: "var(--swiss-surface)",
              border: "none",
              fontSize: "12px",
              fontWeight: 600,
              padding: "6px 16px",
              cursor: "pointer",
            }}
          >
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
