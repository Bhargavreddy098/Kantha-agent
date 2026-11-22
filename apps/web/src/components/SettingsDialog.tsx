import React, { useState } from "react";
import { Dialog, Button, IconButton } from "@astryxdesign/core";
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
  Plus,
  Radio,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { ThemeMode } from "../theme/swissTheme";
import { providerService, type ProvidersDataResponse, type SanitizedProviderItem } from "../services/providerService";

export interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  providersData: ProvidersDataResponse | null;
  onClearHistory: () => Promise<void>;
  conversationCount: number;
  messageCount: number;
  isDaemonOnline: boolean;
  onProvidersUpdated?: () => void;
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
  onProvidersUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("models");
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Custom Provider Form State
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [providerName, setProviderName] = useState("");
  const [providerType, setProviderType] = useState<SanitizedProviderItem["type"]>("openai_compatible");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [configuredModels, setConfiguredModels] = useState<Array<{ id: string; name: string; capabilities?: { reasoning?: boolean; vision?: boolean; streaming?: boolean } }>>([]);
  const [manualModelId, setManualModelId] = useState("");
  const [manualModelName, setManualModelName] = useState("");
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [hasReasoning, setHasReasoning] = useState(false);
  const [hasVision, setHasVision] = useState(false);
  const [customHeadersJson, setCustomHeadersJson] = useState("");

  // Testing & Discovery State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<Array<{ id: string; name: string }>>([]);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [providerFormError, setProviderFormError] = useState<string | null>(null);

  const resetCustomProviderForm = () => {
    setIsAddingProvider(false);
    setEditingProviderId(null);
    setProviderName("");
    setProviderType("openai_compatible");
    setBaseURL("");
    setApiKey("");
    setConfiguredModels([]);
    setManualModelId("");
    setManualModelName("");
    setShowManualAdd(false);
    setHasReasoning(false);
    setHasVision(false);
    setCustomHeadersJson("");
    setTestResult(null);
    setDiscoveredModels([]);
    setProviderFormError(null);
  };

  const handleStartEditProvider = (provider: SanitizedProviderItem) => {
    setEditingProviderId(provider.id);
    setProviderName(provider.name);
    setProviderType(provider.type);
    setBaseURL(provider.baseURL || "");
    setApiKey(""); // Keep blank to preserve existing key
    setConfiguredModels(provider.models || []);
    setDiscoveredModels((provider.models || []).map((m) => ({ id: m.id, name: m.name })));
    setManualModelId("");
    setManualModelName("");
    setShowManualAdd(false);
    const firstModel = provider.models[0];
    setHasReasoning(Boolean(firstModel?.capabilities?.reasoning));
    setHasVision(Boolean(firstModel?.capabilities?.vision));
    setCustomHeadersJson(provider.headers ? JSON.stringify(provider.headers, null, 2) : "");
    setTestResult(null);
    setProviderFormError(null);
    setIsAddingProvider(true);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setProviderFormError(null);

    let parsedHeaders: Record<string, string> | undefined;
    if (customHeadersJson.trim()) {
      try {
        parsedHeaders = JSON.parse(customHeadersJson.trim());
      } catch {
        setProviderFormError("Custom headers must be valid JSON format (e.g. {\"X-Custom\": \"value\"}).");
        setIsTesting(false);
        return;
      }
    }

    try {
      const res = await providerService.testConnection({
        baseURL: baseURL.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        type: providerType,
        headers: parsedHeaders,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDiscoverModels = async () => {
    setIsDiscovering(true);
    setProviderFormError(null);

    let parsedHeaders: Record<string, string> | undefined;
    if (customHeadersJson.trim()) {
      try {
        parsedHeaders = JSON.parse(customHeadersJson.trim());
      } catch {
        setProviderFormError("Custom headers must be valid JSON format.");
        setIsDiscovering(false);
        return;
      }
    }

    try {
      const res = await providerService.discoverModels({
        baseURL: baseURL.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        headers: parsedHeaders,
      });
      if (res.models && res.models.length > 0) {
        setDiscoveredModels(res.models);
        const newModels = res.models.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          capabilities: {
            reasoning:
              m.id.toLowerCase().includes("r1") ||
              m.id.toLowerCase().includes("reason") ||
              m.id.toLowerCase().includes("think") ||
              m.id.toLowerCase().includes("hy4"),
            vision:
              m.id.toLowerCase().includes("vision") ||
              m.id.toLowerCase().includes("image") ||
              m.id.toLowerCase().includes("4o"),
            streaming: true,
          },
        }));
        setConfiguredModels(newModels);
      } else if (res.error) {
        setProviderFormError(res.error);
      } else {
        setProviderFormError(
          "No models discovered from endpoint. You can add models manually using the fallback below."
        );
      }
    } catch (err: any) {
      setProviderFormError(err.message || "Model discovery failed.");
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAddManualModel = () => {
    if (!manualModelId.trim()) {
      setProviderFormError("Please enter a Model ID.");
      return;
    }
    const cleanId = manualModelId.trim();
    if (configuredModels.some((m) => m.id === cleanId)) {
      setProviderFormError(`Model '${cleanId}' is already in the list.`);
      return;
    }
    const addedModel = {
      id: cleanId,
      name: manualModelName.trim() || cleanId,
      capabilities: {
        reasoning: hasReasoning,
        vision: hasVision,
        streaming: true,
      },
    };
    setConfiguredModels((prev) => [...prev, addedModel]);
    setManualModelId("");
    setManualModelName("");
    setProviderFormError(null);
  };

  const handleRemoveModel = (idToRemove: string) => {
    setConfiguredModels((prev) => prev.filter((m) => m.id !== idToRemove));
  };

  const handleSaveCustomProvider = async () => {
    if (!providerName.trim()) {
      setProviderFormError("Provider display name is required.");
      return;
    }

    let finalModels = [...configuredModels];
    if (manualModelId.trim()) {
      const cleanId = manualModelId.trim();
      if (!finalModels.some((m) => m.id === cleanId)) {
        finalModels.push({
          id: cleanId,
          name: manualModelName.trim() || cleanId,
          capabilities: {
            reasoning: hasReasoning,
            vision: hasVision,
            streaming: true,
          },
        });
      }
    }

    if (finalModels.length === 0) {
      setProviderFormError(
        "Please click 'Discover Models' or add at least one model manually before saving."
      );
      return;
    }

    let parsedHeaders: Record<string, string> | undefined;
    if (customHeadersJson.trim()) {
      try {
        parsedHeaders = JSON.parse(customHeadersJson.trim());
      } catch {
        setProviderFormError("Custom headers must be valid JSON.");
        return;
      }
    }

    setIsSavingProvider(true);
    setProviderFormError(null);

    try {
      await providerService.upsertCustomProvider({
        id: editingProviderId || undefined,
        name: providerName.trim(),
        type: providerType,
        baseURL: baseURL.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        headers: parsedHeaders,
        models: finalModels,
      });
      resetCustomProviderForm();
      onProvidersUpdated?.();
    } catch (err: any) {
      setProviderFormError(err.message || "Failed to save provider");
    } finally {
      setIsSavingProvider(false);
    }
  };

  const handleDeleteCustomProvider = async (id: string) => {
    try {
      await providerService.deleteCustomProvider(id);
      onProvidersUpdated?.();
    } catch (err: any) {
      alert(`Failed to delete provider: ${err.message}`);
    }
  };

  const handleSetDefaultModel = async (fullModelId: string) => {
    try {
      await providerService.setDefaultModel(fullModelId);
      onProvidersUpdated?.();
    } catch (err: any) {
      alert(`Failed to set default model: ${err.message}`);
    }
  };

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
          resetCustomProviderForm();
          onClose();
        }
      }}
      width={680}
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
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Models List & Active Selection */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Configured Models
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--swiss-text-secondary)", marginTop: "2px" }}>
                      Select model for active chat or set default model across workspaces.
                    </div>
                  </div>

                  {!isAddingProvider && (
                    <Button
                      label="Add Custom Provider"
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsAddingProvider(true)}
                      style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                    >
                      <Plus size={14} />
                      <span>Add Custom Provider</span>
                    </Button>
                  )}
                </div>

                {/* Custom Provider Form Drawer */}
                {isAddingProvider && (
                  <div
                    style={{
                      marginTop: "12px",
                      marginBottom: "16px",
                      padding: "16px",
                      backgroundColor: "var(--swiss-bg)",
                      border: "1px solid var(--swiss-accent)",
                      borderRadius: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {editingProviderId ? "Edit Custom Provider" : "New Custom AI Provider"}
                      </span>
                      <IconButton
                        icon={<X size={14} />}
                        label="Cancel"
                        variant="ghost"
                        size="sm"
                        onClick={resetCustomProviderForm}
                      />
                    </div>

                    {providerFormError && (
                      <div style={{ padding: "8px 12px", backgroundColor: "#FEE2E2", color: "#991B1B", fontSize: "12px", marginBottom: "12px" }}>
                        {providerFormError}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>
                          Provider Display Name *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Local vLLM, Groq Fast"
                          value={providerName}
                          onChange={(e) => setProviderName(e.target.value)}
                          style={{ width: "100%", padding: "6px 10px", fontSize: "12px", border: "1px solid var(--swiss-border)", backgroundColor: "var(--swiss-surface)", color: "var(--swiss-text)" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>
                          Provider Type *
                        </label>
                        <select
                          value={providerType}
                          onChange={(e) => setProviderType(e.target.value as any)}
                          style={{ width: "100%", padding: "6px 10px", fontSize: "12px", border: "1px solid var(--swiss-border)", backgroundColor: "var(--swiss-surface)", color: "var(--swiss-text)" }}
                        >
                          <option value="openai_compatible">OpenAI-Compatible Endpoint</option>
                          <option value="ollama">Ollama (Local Inference)</option>
                          <option value="openai">OpenAI Direct</option>
                          <option value="anthropic">Anthropic Claude Direct</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>
                        API Base URL
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. http://localhost:8000/v1 or https://api.groq.com/openai/v1"
                        value={baseURL}
                        onChange={(e) => setBaseURL(e.target.value)}
                        style={{ width: "100%", padding: "6px 10px", fontSize: "12px", border: "1px solid var(--swiss-border)", backgroundColor: "var(--swiss-surface)", color: "var(--swiss-text)" }}
                      />
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>
                        API Key (Encrypted on Daemon)
                      </label>
                      <input
                        type="password"
                        placeholder={editingProviderId ? "•••••••• (Leave blank to keep existing key)" : "Enter API key if required"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        style={{ width: "100%", padding: "6px 10px", fontSize: "12px", border: "1px solid var(--swiss-border)", backgroundColor: "var(--swiss-surface)", color: "var(--swiss-text)" }}
                      />
                    </div>

                    {/* Test & Discover Actions */}
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
                      <Button
                        label={isTesting ? "Testing..." : "Test Connection"}
                        variant="secondary"
                        size="sm"
                        isDisabled={isTesting}
                        onClick={handleTestConnection}
                        style={{ fontSize: "11px" }}
                      >
                        {isTesting && <Loader2 size={12} className="animate-spin" style={{ marginRight: "4px" }} />}
                        <span>Test Connection</span>
                      </Button>

                      <Button
                        label={isDiscovering ? "Discovering..." : "Discover Models"}
                        variant="secondary"
                        size="sm"
                        isDisabled={isDiscovering}
                        onClick={handleDiscoverModels}
                        style={{ fontSize: "11px" }}
                      >
                        {isDiscovering && <Loader2 size={12} className="animate-spin" style={{ marginRight: "4px" }} />}
                        <span>Discover Models</span>
                      </Button>

                      {testResult && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: testResult.success ? "#10B981" : "#EF4444" }}>
                          {testResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                          <span>{testResult.success ? `Connected (${testResult.latencyMs}ms)` : (testResult.error || "Connection failed")}</span>
                        </div>
                      )}
                    </div>

                    {/* Discovered / Configured Models List */}
                    {configuredModels.length > 0 && (
                      <div style={{ marginBottom: "12px", padding: "10px 12px", backgroundColor: "var(--swiss-surface)", border: "1px solid var(--swiss-border)", borderRadius: "4px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--swiss-text)" }}>
                            Available Models ({configuredModels.length}) — Will be saved:
                          </span>
                          <span style={{ fontSize: "10px", color: "var(--swiss-text-secondary)" }}>
                            Click × to remove any
                          </span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "180px", overflowY: "auto", paddingRight: "4px" }}>
                          {configuredModels.map((m) => (
                            <span
                              key={m.id}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "3px 8px",
                                fontSize: "11px",
                                backgroundColor: "var(--swiss-bg)",
                                color: "var(--swiss-text)",
                                border: "1px solid var(--swiss-border)",
                                borderRadius: "3px",
                              }}
                            >
                              <span style={{ fontWeight: 500 }}>{m.id}</span>
                              {m.name && m.name !== m.id && (
                                <span style={{ opacity: 0.6, fontSize: "10px" }}>({m.name})</span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveModel(m.id)}
                                title="Remove model"
                                style={{
                                  border: "none",
                                  background: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  color: "var(--swiss-text-secondary)",
                                }}
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Optional Fallback: Add Model Manually */}
                    <div style={{ marginBottom: "14px" }}>
                      <button
                        type="button"
                        onClick={() => setShowManualAdd(!showManualAdd)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "var(--swiss-accent)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Plus size={12} />
                        <span>{showManualAdd ? "Hide Manual Model Entry" : "Add Model Manually (Optional Fallback)"}</span>
                      </button>

                      {showManualAdd && (
                        <div style={{ marginTop: "8px", padding: "10px", backgroundColor: "var(--swiss-bg)", border: "1px solid var(--swiss-border)", borderRadius: "4px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "8px" }}>
                            <div>
                              <label style={{ display: "block", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>
                                Model ID *
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. llama-3.3-70b-versatile"
                                value={manualModelId}
                                onChange={(e) => setManualModelId(e.target.value)}
                                style={{ width: "100%", padding: "5px 8px", fontSize: "11px", border: "1px solid var(--swiss-border)", backgroundColor: "var(--swiss-surface)", color: "var(--swiss-text)" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>
                                Model Display Name
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Llama 3.3 70B Fast"
                                value={manualModelName}
                                onChange={(e) => setManualModelName(e.target.value)}
                                style={{ width: "100%", padding: "5px 8px", fontSize: "11px", border: "1px solid var(--swiss-border)", backgroundColor: "var(--swiss-surface)", color: "var(--swiss-text)" }}
                              />
                            </div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", gap: "12px", fontSize: "11px" }}>
                              <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                                <input
                                  type="checkbox"
                                  checked={hasReasoning}
                                  onChange={(e) => setHasReasoning(e.target.checked)}
                                />
                                <span>Reasoning</span>
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                                <input
                                  type="checkbox"
                                  checked={hasVision}
                                  onChange={(e) => setHasVision(e.target.checked)}
                                />
                                <span>Vision</span>
                              </label>
                            </div>
                            <Button
                              label="Add to List"
                              variant="secondary"
                              size="sm"
                              onClick={handleAddManualModel}
                              style={{ fontSize: "11px", padding: "4px 8px" }}
                            >
                              Add Model
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                      <Button
                        label="Cancel"
                        variant="secondary"
                        size="sm"
                        onClick={resetCustomProviderForm}
                      >
                        Cancel
                      </Button>
                      <Button
                        label={isSavingProvider ? "Saving..." : "Save Provider"}
                        variant="primary"
                        size="sm"
                        isDisabled={isSavingProvider}
                        onClick={handleSaveCustomProvider}
                        style={{ backgroundColor: "var(--swiss-text)", color: "var(--swiss-surface)" }}
                      >
                        {isSavingProvider ? "Saving..." : "Save Provider"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Models List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {providersData?.providers?.flatMap((provider) =>
                    provider.models.map((m) => {
                      const fullModelId = `${provider.id}:${m.id}`;
                      const isSelected = selectedModel === fullModelId || selectedModel === m.id;
                      const isDefault = providersData.defaultModel === fullModelId || providersData.defaultModel === m.id;

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
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "13px", fontWeight: isSelected ? 600 : 500, color: "var(--swiss-text)" }}>
                                {m.name}
                              </span>
                              {m.capabilities?.reasoning && (
                                <span style={{ fontSize: "10px", padding: "1px 5px", backgroundColor: "var(--swiss-surface)", border: "1px solid var(--swiss-border)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
                                  Thinking
                                </span>
                              )}
                              {m.capabilities?.vision && (
                                <span style={{ fontSize: "10px", padding: "1px 5px", backgroundColor: "var(--swiss-surface)", border: "1px solid var(--swiss-border)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
                                  Vision
                                </span>
                              )}
                              {isDefault && (
                                <span style={{ fontSize: "10px", padding: "1px 5px", backgroundColor: "var(--swiss-accent)", color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>
                                  Default
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--swiss-text-secondary)" }}>
                              Provider: {provider.name} {provider.configured ? "● Active" : "○ Not Configured"}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {!isDefault && (
                              <button
                                type="button"
                                title="Set as System Default"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSetDefaultModel(fullModelId);
                                }}
                                style={{
                                  border: "none",
                                  background: "none",
                                  fontSize: "11px",
                                  color: "var(--swiss-text-secondary)",
                                  cursor: "pointer",
                                  textDecoration: "underline",
                                }}
                              >
                                Make Default
                              </button>
                            )}

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
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Providers Configuration Overview */}
              <div style={{ borderTop: "1px solid var(--swiss-border)", paddingTop: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--swiss-text-secondary)", marginBottom: "8px" }}>
                  Configured Providers & Endpoints
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
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 500 }}>{p.name}</span>
                        {p.isCustom && (
                          <span style={{ fontSize: "10px", padding: "1px 4px", backgroundColor: "var(--swiss-border)", textTransform: "uppercase" }}>
                            Custom
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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

                        {p.isCustom && (
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <button
                              type="button"
                              onClick={() => handleStartEditProvider(p)}
                              title="Edit Provider"
                              style={{ border: "none", background: "none", cursor: "pointer", padding: "2px", color: "var(--swiss-text-secondary)" }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomProvider(p.id)}
                              title="Delete Provider"
                              style={{ border: "none", background: "none", cursor: "pointer", padding: "2px", color: "#DC2626" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
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
