"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@astryxdesign/core/Badge";
import {
  ArrowLeft,
  KeyRound,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Eye,
  EyeOff,
  Clipboard,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Cpu,
  Layers,
  Search,
  X,
  Sliders,
} from "lucide-react";
import { DashboardButton, DashboardConfirmDialog } from "@/components/block/dashboard-shell";
import { useGatewayAccess } from "@/components/gateway/gateway-access-gate";
import {
  gatewayMessage,
  gatewayRequest,
  jsonBody,
  MODEL_CATALOG_CHANGED,
} from "@/lib/gateway/client";
import { Card } from "@/components/ui/card";
import { catalogModelKey, rememberCatalogModel } from "@/hooks/use-ai-provider";
import { cn } from "@/lib/utils";
import type {
  DiscoverModelsResult,
  GatewayConnection,
  ProviderType,
  TestConnectionResult,
} from "@/lib/gateway/contracts/connection";

type Connection = Omit<GatewayConnection, "secretRef"> & { hasCredential: boolean };

export interface ModelProvidersViewProps {
  showBackButton?: boolean;
  onBack?: () => void;
}

export interface VercelAIProviderSpec {
  id: ProviderType;
  name: string;
  sdkPackage: string;
  badge: string;
  description: string;
  defaultEndpoint: string;
  keyPlaceholder: string;
  defaultModels: string[];
  docUrl: string;
  isLocal?: boolean;
}

export const VERCEL_AI_SDK_PROVIDERS: VercelAIProviderSpec[] = [
  {
    id: "openai",
    name: "OpenAI",
    sdkPackage: "@ai-sdk/openai",
    badge: "Official SDK",
    description: "Industry-standard models: GPT-4o, GPT-4o mini, o1 reasoning, and o3-mini.",
    defaultEndpoint: "https://api.openai.com/v1",
    keyPlaceholder: "sk-proj-...",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini", "gpt-4-turbo"],
    docUrl: "https://sdk.vercel.ai/providers/ai-sdk-providers/openai",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    sdkPackage: "@ai-sdk/anthropic",
    badge: "Official SDK",
    description: "World-class coding and reasoning with Claude 3.7 Sonnet, 3.5 Sonnet, and Haiku.",
    defaultEndpoint: "https://api.anthropic.com/v1",
    keyPlaceholder: "sk-ant-...",
    defaultModels: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    docUrl: "https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic",
  },
  {
    id: "groq",
    name: "Groq",
    sdkPackage: "@ai-sdk/openai-compatible",
    badge: "LPU Inference",
    description: "Ultra low-latency LPU hardware running open weights (Llama 3.3 70B, DeepSeek R1).",
    defaultEndpoint: "https://api.groq.com/openai/v1",
    keyPlaceholder: "gsk_...",
    defaultModels: ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b", "llama-3.1-8b-instant"],
    docUrl: "https://sdk.vercel.ai/providers/ai-sdk-providers/groq",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    sdkPackage: "@ai-sdk/openai-compatible",
    badge: "Reasoning & Chat",
    description: "DeepSeek-V3 conversational chat and DeepSeek-R1 full open-weights reasoning.",
    defaultEndpoint: "https://api.deepseek.com/v1",
    keyPlaceholder: "sk-...",
    defaultModels: ["deepseek-chat", "deepseek-reasoner"],
    docUrl: "https://sdk.vercel.ai/providers/ai-sdk-providers/deepseek",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    sdkPackage: "@ai-sdk/openai-compatible",
    badge: "200+ Models",
    description: "Unified AI gateway routing to Claude, GPT-4, Llama, Gemini, and open weights.",
    defaultEndpoint: "https://openrouter.ai/api/v1",
    keyPlaceholder: "sk-or-...",
    defaultModels: [
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "deepseek/deepseek-r1",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    docUrl: "https://openrouter.ai",
  },
  {
    id: "together",
    name: "Together AI",
    sdkPackage: "@ai-sdk/openai-compatible",
    badge: "Open Weights",
    description: "High-throughput cloud GPU inference for open source generative models.",
    defaultEndpoint: "https://api.together.xyz/v1",
    keyPlaceholder: "tog_...",
    defaultModels: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-R1"],
    docUrl: "https://sdk.vercel.ai/providers/ai-sdk-providers/togetherai",
  },
  {
    id: "ollama",
    name: "Ollama (Local AI)",
    sdkPackage: "@ai-sdk/openai-compatible",
    badge: "Local / Offline",
    description: "Run open models completely locally on your hardware with 100% privacy.",
    defaultEndpoint: "http://localhost:11434/v1",
    keyPlaceholder: "Optional for local servers",
    defaultModels: ["llama3.2", "deepseek-r1", "mistral", "qwen2.5"],
    docUrl: "https://ollama.com",
    isLocal: true,
  },
  {
    id: "custom",
    name: "Custom OpenAI-Compatible",
    sdkPackage: "@ai-sdk/openai-compatible",
    badge: "OpenAI Protocol",
    description: "Connect LM Studio, LocalAI, vLLM, or any custom API conforming to the OpenAI standard.",
    defaultEndpoint: "http://localhost:1234/v1",
    keyPlaceholder: "Optional or bearer token",
    defaultModels: ["custom-model"],
    docUrl: "https://sdk.vercel.ai/providers/openai-compatible-providers",
  },
];

const connectionUrl = "/api/gateway/connections";

type EditState =
  | {
      spec: VercelAIProviderSpec;
      connection?: Connection;
      isCustom?: false;
    }
  | {
      connection?: Connection;
      isCustom: true;
    };

export function ModelProvidersView({ showBackButton = true, onBack }: ModelProvidersViewProps) {
  const router = useRouter();
  const searchInputId = useId();
  const providerLabelId = useId();
  const providerEndpointId = useId();
  const providerApiKeyId = useId();
  const newModelInputId = useId();
  const access = useGatewayAccess();
  const canManage = access?.roles?.includes("owner") ?? false;

  const [connections, setConnections] = useState<Connection[]>();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [form, setForm] = useState({
    label: "",
    endpoint: "",
    apiKey: "",
    models: [] as string[],
    newModel: "",
  });
  const [pending, setPending] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<Connection>();
  const [test, setTest] = useState<{ id: string; result: TestConnectionResult }>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [showApiKey, setShowApiKey] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "configured" | "cloud" | "local">("all");
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});

  const activeRequest = useRef<AbortController | null>(null);

  async function refresh(signal?: AbortSignal) {
    const response = await gatewayRequest<{ connections: Connection[] }>(connectionUrl, { signal });
    if (!signal?.aborted) setConnections(response.connections);
  }

  useEffect(() => {
    const controller = new AbortController();

    const loadConnections = async () => {
      try {
        await refresh(controller.signal);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(gatewayMessage(err, "Could not load saved connections."));
        }
      }
    };

    void loadConnections();

    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, []);

  async function perform(operation: string, action: (signal: AbortSignal) => Promise<void>) {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(operation);
    setNotice(undefined);
    setError(undefined);
    try {
      await action(controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(gatewayMessage(err, "Could not complete the provider request. Try again."));
      }
    } finally {
      activeRequest.current = null;
      if (!controller.signal.aborted) setPending(undefined);
    }
  }

  const readClipboardText = async (): Promise<string> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        return (await navigator.clipboard.readText()) || "";
      }
    } catch {
      // Browser permission
    }
    return "";
  };

  const getMatchedConnection = (spec: VercelAIProviderSpec): Connection | undefined => {
    if (!connections) return undefined;
    return connections.find(
      (c) =>
        c.providerType === spec.id ||
        (spec.defaultEndpoint && c.endpoint.replace(/\/+$/, "") === spec.defaultEndpoint.replace(/\/+$/, ""))
    );
  };

  const customConnections = useMemo(() => {
    if (!connections) return [];
    const specIds = new Set(VERCEL_AI_SDK_PROVIDERS.map((s) => s.id));
    const specEndpoints = new Set(VERCEL_AI_SDK_PROVIDERS.map((s) => s.defaultEndpoint.replace(/\/+$/, "")));
    return connections.filter(
      (c) => !specIds.has(c.providerType) && !specEndpoints.has(c.endpoint.replace(/\/+$/, ""))
    );
  }, [connections]);

  const configuredCount = useMemo(() => {
    if (!connections) return 0;
    return connections.filter((c) => c.status === "active").length;
  }, [connections]);

  const totalModelsCount = useMemo(() => {
    if (!connections) return 0;
    const all = new Set<string>();
    for (const c of connections) {
      if (c.status === "active" && Array.isArray(c.eligibleModels)) {
        for (const m of c.eligibleModels) all.add(m);
      }
    }
    return all.size;
  }, [connections]);

  function openSpecEditor(spec: VercelAIProviderSpec) {
    const existing = getMatchedConnection(spec);
    setEditing({ spec, connection: existing, isCustom: false });
    setError(undefined);
    setShowApiKey(false);
    setForm({
      label: existing?.label || spec.name,
      endpoint: existing?.endpoint || spec.defaultEndpoint,
      apiKey: "",
      models: existing?.eligibleModels && existing.eligibleModels.length > 0 ? [...existing.eligibleModels] : [...spec.defaultModels],
      newModel: "",
    });
  }

  function openCustomEditor(connection?: Connection) {
    setEditing({ connection, isCustom: true });
    setError(undefined);
    setShowApiKey(false);
    setForm({
      label: connection?.label || "",
      endpoint: connection?.endpoint ?? "",
      apiKey: "",
      models: connection?.eligibleModels ? [...connection.eligibleModels] : ["custom-model"],
      newModel: "",
    });
  }

  function closeEditor() {
    setEditing(null);
    setForm({ label: "", endpoint: "", apiKey: "", models: [], newModel: "" });
    setShowApiKey(false);
    setError(undefined);
  }

  function setDraftField(field: "label" | "endpoint" | "apiKey" | "newModel", value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addModelTag() {
    const m = form.newModel.trim();
    if (!m) return;
    if (!form.models.includes(m)) {
      setForm((curr) => ({ ...curr, models: [...curr.models, m], newModel: "" }));
    } else {
      setForm((curr) => ({ ...curr, newModel: "" }));
    }
  }

  function removeModelTag(model: string) {
    setForm((curr) => ({ ...curr, models: curr.models.filter((m) => m !== model) }));
  }

  async function saveProvider(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;

    let rawEndpoint = form.endpoint.trim();
    if (!rawEndpoint) {
      setError("Please enter a provider base URL.");
      return;
    }
    if (!/^[a-z][a-z\d+.-]*:\/\//i.test(rawEndpoint)) {
      if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(?=[:/]|$)/i.test(rawEndpoint)) {
        rawEndpoint = "http://" + rawEndpoint;
      } else {
        rawEndpoint = "https://" + rawEndpoint;
      }
    }
    let endpoint: URL;
    try {
      endpoint = new URL(rawEndpoint);
      if (!["http:", "https:"].includes(endpoint.protocol)) throw new Error("Unsupported protocol");
    } catch {
      setError("Please enter a valid base URL (e.g. https://api.openai.com/v1).");
      return;
    }

    const cleanEndpoint = endpoint.href.replace(/\/+$/, "");
    const providerType: ProviderType = editing.isCustom ? "custom" : editing.spec.id;
    const label = form.label.trim() || (editing.isCustom ? endpoint.hostname.slice(0, 100) : editing.spec.name);
    const eligibleModels = form.models.length > 0 ? form.models : editing.isCustom ? ["custom-model"] : editing.spec.defaultModels;

    const payload = {
      label,
      endpoint: cleanEndpoint,
      providerType,
      eligibleModels,
      ...(form.apiKey.trim() && { apiKey: form.apiKey.trim() }),
    };

    await perform("save", async (signal) => {
      const existingConn = editing.connection;
      if (!existingConn) {
        await gatewayRequest(connectionUrl, {
          method: "POST",
          signal,
          ...jsonBody(payload),
        });
      } else {
        await gatewayRequest(connectionUrl + "/" + encodeURIComponent(existingConn.id), {
          method: "PATCH",
          signal,
          ...jsonBody(payload),
        });
      }

      closeEditor();
      window.dispatchEvent(new Event(MODEL_CATALOG_CHANGED));
      const firstModel = eligibleModels[0];
      if (firstModel) {
        // Automatically preselect in chat
        rememberCatalogModel(catalogModelKey(existingConn?.id || "default", firstModel));
      }
      setNotice(`${label} provider saved with ${eligibleModels.length} models ready for Chat.`);
      await refresh(signal);
    });
  }

  async function connectionAction(id: string, action: "test" | "discover") {
    await perform(action + ":" + id, async (signal) => {
      const path = connectionUrl + "/" + encodeURIComponent(id) + "/" + action;
      if (action === "test") {
        setTest(undefined);
        const result = await gatewayRequest<TestConnectionResult>(path, { method: "POST", signal, ...jsonBody({}) });
        if (!signal.aborted) setTest({ id, result });
      } else {
        const result = await gatewayRequest<DiscoverModelsResult>(path, { method: "POST", signal, ...jsonBody({}) });
        const firstModel = result.models[0];
        if (firstModel) rememberCatalogModel(catalogModelKey(id, firstModel.id));
        window.dispatchEvent(new Event(MODEL_CATALOG_CHANGED));
        setNotice(
          firstModel
            ? "Discovered " + result.models.length + " models. Selected " + firstModel.name + " for Chat."
            : "The provider returned no extra eligible models."
        );
      }
      await refresh(signal);
    });
  }

  async function deleteConnection(connection: Connection) {
    await perform("delete:" + connection.id, async (signal) => {
      await gatewayRequest(connectionUrl + "/" + encodeURIComponent(connection.id), { method: "DELETE", signal });
      setConnections((current) => current?.filter((item) => item.id !== connection.id));
      setDeleteTarget(undefined);
      window.dispatchEvent(new Event(MODEL_CATALOG_CHANGED));
      setNotice(`Connection "${connection.label}" deleted.`);
    });
  }

  const filteredProviders = useMemo(() => {
    return VERCEL_AI_SDK_PROVIDERS.filter((spec) => {
      const conn = getMatchedConnection(spec);
      const isConfigured = Boolean(conn && conn.status === "active");

      if (filterTab === "configured" && !isConfigured) return false;
      if (filterTab === "local" && !spec.isLocal) return false;
      if (filterTab === "cloud" && spec.isLocal) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = spec.name.toLowerCase().includes(q);
      const matchPkg = spec.sdkPackage.toLowerCase().includes(q);
      const matchDesc = spec.description.toLowerCase().includes(q);
      const matchModels = spec.defaultModels.some((m) => m.toLowerCase().includes(q));
      const matchConnModels = conn?.eligibleModels?.some((m) => m.toLowerCase().includes(q)) ?? false;

      return matchName || matchPkg || matchDesc || matchModels || matchConnModels;
    });
  }, [searchQuery, filterTab, connections]);

  const toggleExpandModels = (id: string) => {
    setExpandedModels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="w-full max-w-[900px] mx-auto py-2 flex flex-col gap-5 text-neutral-900">
      {showBackButton && (
        <div>
          <DashboardButton variant="secondary" size="sm" onClick={onBack ?? router.back}>
            <ArrowLeft className="mr-1.5 size-4 stroke-[1.8]" /> Back
          </DashboardButton>
        </div>
      )}

      {/* Header with Vercel AI SDK Branding */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#0000001a] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#0d0d0d]">
              <Server className="size-5 stroke-[1.8] text-[#0d0d0d]" /> Model Providers
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white tracking-wide">
              <Sparkles className="size-2.5 text-neutral-200" /> Vercel AI SDK
            </span>
          </div>
          <p className="text-xs text-[#5d5d5d]">
            Integrated via Vercel AI SDK. Configure provider API keys securely on the server to unlock models in Chat.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <DashboardButton variant="secondary" size="sm" onClick={() => openCustomEditor()}>
              <Plus className="mr-1.5 size-4 stroke-[2]" /> Custom Endpoint
            </DashboardButton>
          </div>
        )}
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-[10px] border border-[#0000001a] bg-[#f9f9f9] p-3">
          <p className="text-[11px] font-medium text-[#5d5d5d]">Active Providers</p>
          <p className="text-lg font-bold text-[#0d0d0d] mt-0.5">
            {configuredCount} <span className="text-xs font-normal text-[#8f8f8f]">/ {VERCEL_AI_SDK_PROVIDERS.length}</span>
          </p>
        </div>
        <div className="rounded-[10px] border border-[#0000001a] bg-[#f9f9f9] p-3">
          <p className="text-[11px] font-medium text-[#5d5d5d]">Models Available in Chat</p>
          <p className="text-lg font-bold text-[#0d0d0d] mt-0.5">{totalModelsCount}</p>
        </div>
        <div className="rounded-[10px] border border-[#0000001a] bg-[#f9f9f9] p-3 col-span-2 sm:col-span-1">
          <p className="text-[11px] font-medium text-[#5d5d5d]">Key Storage</p>
          <p className="text-xs font-semibold text-emerald-700 mt-1 flex items-center gap-1">
            <CheckCircle2 className="size-3.5" /> Server Encrypted (Zero Browser Leak)
          </p>
        </div>
      </div>

      {/* Error & Notice Banners */}
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-800">
          <span>{error}</span>
          {!connections && (
            <DashboardButton size="sm" variant="secondary" onClick={() => void perform("refresh", refresh)} disabled={!!pending}>
              Retry
            </DashboardButton>
          )}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-[10px] border border-[#0000001a] bg-[#f9f9f9] p-3 text-[13px] text-[#0d0d0d] flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1 bg-[#f0f0f0] p-1 rounded-lg">
          {(
            [
              { id: "all", label: "All Providers" },
              { id: "configured", label: `Configured (${configuredCount})` },
              { id: "cloud", label: "Cloud" },
              { id: "local", label: "Local / Offline" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer",
                filterTab === tab.id
                  ? "bg-white text-[#0d0d0d] shadow-xs"
                  : "text-[#5d5d5d] hover:text-[#0d0d0d]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] sm:w-64">
          <label htmlFor={searchInputId} className="sr-only">
            Search providers or models
          </label>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#8f8f8f]" />
          <input
            id={searchInputId}
            type="text"
            placeholder="Search providers or models…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-[8px] border border-[#0000001a] bg-white pl-8 pr-3 py-1.5 text-xs text-[#0d0d0d] placeholder:text-[#8f8f8f] focus:outline-none focus:border-[#0d0d0d]"
          />
        </div>
      </div>

      {/* Provider Editor Form (Modal / Inline Card) */}
      {editing && (
        <Card className="space-y-4 rounded-[12px] border-2 border-neutral-900 bg-[#ffffff] p-5 shadow-sm text-[#0d0d0d]">
          <div className="flex items-center justify-between border-b border-[#0000001a] pb-3">
            <div className="flex items-center gap-2">
              <KeyRound className="size-5 stroke-[1.8] text-neutral-900" />
              <div>
                <h3 className="text-sm font-semibold text-[#0d0d0d]">
                  {editing.isCustom
                    ? editing.connection
                      ? "Edit Custom Provider"
                      : "Add Custom Provider"
                    : `Configure ${editing.spec.name} (${editing.spec.sdkPackage})`}
                </h3>
                <p className="text-xs text-[#5d5d5d]">
                  {editing.isCustom
                    ? "Connect an OpenAI-compatible runtime or local model server."
                    : editing.spec.description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeEditor}
              className="text-[#8f8f8f] hover:text-[#0d0d0d] p-1 cursor-pointer"
              aria-label="Close form"
            >
              <X className="size-4" />
            </button>
          </div>

          <form className="space-y-4" onSubmit={saveProvider}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={providerLabelId} className="text-[12px] font-medium text-[#5d5d5d]">
                  Connection label
                </label>
                <input
                  id={providerLabelId}
                  name="label"
                  type="text"
                  autoComplete="off"
                  maxLength={100}
                  value={form.label}
                  onChange={(event) => setDraftField("label", event.currentTarget.value)}
                  placeholder={editing.isCustom ? "Defaults to the URL hostname" : editing.spec.name}
                  className="w-full rounded-[8px] border border-[#0000001a] bg-white px-3 py-2 text-[13px] text-[#0d0d0d] focus:border-[#0d0d0d] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={providerEndpointId} className="text-[12px] font-medium text-[#5d5d5d]">
                    Base URL <span className="text-[#0d0d0d] font-semibold">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      const text = await readClipboardText();
                      if (text) setForm((c) => ({ ...c, endpoint: text.trim() }));
                    }}
                    className="flex items-center gap-1 text-[11px] text-[#5d5d5d] hover:text-[#0d0d0d] cursor-pointer"
                  >
                    <Clipboard className="size-3" /> Paste
                  </button>
                </div>
                <input
                  id={providerEndpointId}
                  name="endpoint"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={2048}
                  value={form.endpoint}
                  onChange={(event) => setDraftField("endpoint", event.currentTarget.value)}
                  placeholder={editing.isCustom ? "http://localhost:1234/v1" : editing.spec.defaultEndpoint}
                  className="w-full rounded-[8px] border border-[#0000001a] bg-white px-3 py-2 text-[13px] text-[#0d0d0d] focus:border-[#0d0d0d] focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={providerApiKeyId} className="text-[12px] font-medium text-[#5d5d5d]">
                  {editing.connection?.hasCredential ? "Replacement API Key" : "Provider API Key"}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const text = await readClipboardText();
                      if (text) setForm((c) => ({ ...c, apiKey: text.trim() }));
                    }}
                    className="flex items-center gap-1 text-[11px] text-[#5d5d5d] hover:text-[#0d0d0d] cursor-pointer"
                  >
                    <Clipboard className="size-3" /> Paste
                  </button>
                  <span className="text-[11px] text-[#8f8f8f]">
                    {editing.isCustom || (!editing.isCustom && editing.spec.isLocal) ? "Optional" : "Required"}
                  </span>
                </div>
              </div>
              <div className="relative">
                <input
                  id={providerApiKeyId}
                  type={showApiKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    editing.isCustom
                      ? "Optional for local endpoints"
                      : editing.spec.keyPlaceholder
                  }
                  value={form.apiKey}
                  onChange={(event) => setDraftField("apiKey", event.currentTarget.value)}
                  className="w-full rounded-[8px] border border-[#0000001a] bg-white px-3 py-2 pr-9 text-[13px] text-[#0d0d0d] placeholder:text-[#8f8f8f] focus:border-[#0d0d0d] focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  aria-label={showApiKey ? "Hide key" : "Show key"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8f8f8f] hover:text-[#0d0d0d] p-1 cursor-pointer"
                >
                  {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-[11px] text-[#5d5d5d]">
                Keys are stored encrypted exclusively on the server in SQLite and never transmitted to the browser.
                {editing.connection?.hasCredential && " Leave empty to preserve the existing stored credential."}
              </p>
            </div>

            {/* Model Selection Tags */}
            <div className="space-y-2 pt-1 border-t border-[#0000001a]">
              <div className="flex items-center justify-between">
                <label htmlFor={newModelInputId} className="text-[12px] font-medium text-[#5d5d5d]">
                  Eligible Models for Chat ({form.models.length})
                </label>
                <span className="text-[11px] text-[#8f8f8f]">Available in the model picker</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-[8px] border border-[#0000001a] bg-[#f9f9f9] min-h-[44px]">
                {form.models.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1 rounded-md bg-white border border-[#0000001a] px-2 py-0.5 text-xs font-mono text-[#0d0d0d] shadow-2xs"
                  >
                    <span>{m}</span>
                    <button
                      type="button"
                      onClick={() => removeModelTag(m)}
                      className="text-[#8f8f8f] hover:text-red-600 p-0.5 cursor-pointer"
                      aria-label={`Remove ${m}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  id={newModelInputId}
                  type="text"
                  placeholder="Add custom model identifier (e.g. gpt-4.5-preview)"
                  value={form.newModel}
                  onChange={(event) => setDraftField("newModel", event.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addModelTag();
                    }
                  }}
                  className="flex-1 rounded-[8px] border border-[#0000001a] bg-white px-3 py-1.5 text-xs text-[#0d0d0d] placeholder:text-[#8f8f8f] focus:outline-none focus:border-[#0d0d0d]"
                />
                <DashboardButton type="button" variant="secondary" size="sm" onClick={addModelTag}>
                  Add Model
                </DashboardButton>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#0000001a]">
              <DashboardButton type="button" variant="secondary" size="sm" onClick={closeEditor} disabled={!!pending}>
                Cancel
              </DashboardButton>
              <DashboardButton type="submit" size="sm" disabled={!!pending}>
                {pending === "save" ? "Saving…" : "Save & Activate Provider"}
              </DashboardButton>
            </div>
          </form>
        </Card>
      )}

      {/* Providers Grid */}
      <div className="grid gap-3">
        {filteredProviders.map((spec) => {
          const conn = getMatchedConnection(spec);
          const isConfigured = Boolean(conn && conn.status === "active");
          const isTestingThis = pending === "test:" + conn?.id;
          const isDiscoveringThis = pending === "discover:" + conn?.id;
          const isExpanded = Boolean(expandedModels[spec.id]);
          const currentModels = conn?.eligibleModels && conn.eligibleModels.length > 0 ? conn.eligibleModels : spec.defaultModels;

          return (
            <Card
              key={spec.id}
              className={cn(
                "rounded-[10px] border p-4 transition-all duration-150 bg-white",
                isConfigured ? "border-neutral-300 shadow-2xs" : "border-[#0000001a] hover:border-neutral-300"
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#0d0d0d]">{spec.name}</h3>
                    <span className="font-mono text-[11px] text-[#5d5d5d] bg-[#f0f0f0] px-2 py-0.5 rounded">
                      {spec.sdkPackage}
                    </span>
                    {isConfigured ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium">
                        <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-neutral-100 text-neutral-600 px-2 py-0.5 text-[11px] font-medium">
                        Not configured
                      </span>
                    )}
                    {conn?.hasCredential && (
                      <Badge label="Credential saved" variant="neutral" />
                    )}
                  </div>

                  <p className="text-xs text-[#5d5d5d]">{spec.description}</p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 pt-0.5">
                    <span className="font-mono text-[11px]">{conn?.endpoint || spec.defaultEndpoint}</span>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => toggleExpandModels(spec.id)}
                      className="text-neutral-700 hover:text-neutral-900 font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Layers className="size-3" />
                      {currentModels.length} models {isExpanded ? "(Hide)" : "(Show)"}
                    </button>
                    {conn?.lastTestedAt && (
                      <>
                        <span>·</span>
                        <span>Tested {new Date(conn.lastTestedAt).toLocaleTimeString()}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0 pt-2 sm:pt-0">
                  {isConfigured && conn ? (
                    <>
                      <DashboardButton
                        variant="secondary"
                        size="sm"
                        onClick={() => void connectionAction(conn.id, "test")}
                        disabled={!!pending}
                      >
                        <RefreshCw className={cn("mr-1 size-3.5", isTestingThis && "animate-spin")} />
                        {isTestingThis ? "Testing…" : "Test"}
                      </DashboardButton>
                      <DashboardButton
                        variant="secondary"
                        size="sm"
                        onClick={() => void connectionAction(conn.id, "discover")}
                        disabled={!!pending}
                      >
                        {isDiscoveringThis ? "Discovering…" : "Discover"}
                      </DashboardButton>
                      <DashboardButton
                        variant="secondary"
                        size="sm"
                        onClick={() => openSpecEditor(spec)}
                        disabled={!!pending}
                      >
                        <Sliders className="mr-1 size-3.5" /> Edit
                      </DashboardButton>
                      <DashboardButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setDeleteTarget(conn)}
                        disabled={!!pending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="size-3.5" />
                      </DashboardButton>
                    </>
                  ) : (
                    <DashboardButton
                      size="sm"
                      onClick={() => openSpecEditor(spec)}
                      disabled={!!pending || !canManage}
                    >
                      Configure Provider
                    </DashboardButton>
                  )}
                </div>
              </div>

              {/* Test Result Feedback */}
              {conn && test?.id === conn.id && (
                <div
                  role={test.result.success ? "status" : "alert"}
                  className={cn(
                    "mt-3 rounded-[8px] p-2.5 text-xs flex items-center justify-between",
                    test.result.success
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-rose-50 text-rose-800 border border-rose-200"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {test.result.success ? <CheckCircle2 className="size-4 text-emerald-600" /> : <X className="size-4 text-rose-600" />}
                    {test.result.message}
                  </span>
                  <span className="font-mono text-[11px] text-neutral-500">{test.result.latencyMs}ms</span>
                </div>
              )}

              {conn && test?.id !== conn.id && conn.lastError && (
                <div role="alert" className="mt-3 rounded-[8px] p-2.5 text-xs bg-rose-50 text-rose-800 border border-rose-200">
                  {conn.lastError}
                </div>
              )}

              {/* Collapsible Model List */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-[#0000001a] space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-[#5d5d5d]">
                    <span>Eligible models ready for Chat:</span>
                    <a
                      href={spec.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-[#0d0d0d] transition-colors"
                    >
                      Docs <ExternalLink className="size-3" />
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {currentModels.map((m) => (
                      <span
                        key={m}
                        className="rounded bg-[#f0f0f0] px-2 py-0.5 text-xs font-mono text-[#0d0d0d]"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {/* Custom Connections List */}
        {customConnections.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-[#0000001a]">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Cpu className="size-4" /> Custom OpenAI-Compatible Connections ({customConnections.length})
            </h3>
            {customConnections.map((conn) => (
              <Card key={conn.id} className="rounded-[10px] border border-[#0000001a] p-4 bg-white space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{conn.label}</h4>
                      <Badge label={conn.status} variant={conn.status === "active" ? "success" : "neutral"} />
                      {conn.hasCredential && <Badge label="Credential saved" variant="neutral" />}
                    </div>
                    <p className="font-mono text-xs text-neutral-600 break-all">{conn.endpoint}</p>
                    <p className="text-xs text-neutral-500">
                      {conn.eligibleModels.length} models {conn.lastTestedAt && `· Tested ${new Date(conn.lastTestedAt).toLocaleTimeString()}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <DashboardButton
                      variant="secondary"
                      size="sm"
                      onClick={() => void connectionAction(conn.id, "test")}
                      disabled={!!pending}
                    >
                      Test
                    </DashboardButton>
                    <DashboardButton
                      variant="secondary"
                      size="sm"
                      onClick={() => void connectionAction(conn.id, "discover")}
                      disabled={!!pending}
                    >
                      Discover
                    </DashboardButton>
                    <DashboardButton
                      variant="secondary"
                      size="sm"
                      onClick={() => openCustomEditor(conn)}
                      disabled={!!pending}
                    >
                      Edit
                    </DashboardButton>
                    <DashboardButton
                      variant="secondary"
                      size="sm"
                      onClick={() => setDeleteTarget(conn)}
                      disabled={!!pending}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="size-3.5" />
                    </DashboardButton>
                  </div>
                </div>

                {test?.id === conn.id && (
                  <p className={cn("text-xs", test.result.success ? "text-emerald-700" : "text-rose-700")}>
                    {test.result.message} ({test.result.latencyMs}ms)
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DashboardConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        title={"Disconnect " + (deleteTarget?.label ?? "this provider") + "?"}
        description="Its models will be removed from Chat and its stored credential will be deleted from the server."
        confirmLabel="Disconnect Provider"
        tone="danger"
        onConfirm={() => {
          if (deleteTarget) void deleteConnection(deleteTarget);
        }}
      />
    </div>
  );
}
