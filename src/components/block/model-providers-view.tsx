"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Badge } from "@astryxdesign/core/Badge";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ArrowLeft, KeyRound, Plus, RefreshCw, Server } from "lucide-react";
import { DashboardButton, DashboardConfirmDialog } from "@/components/block/dashboard-shell";
import { useGatewayAccess } from "@/components/gateway/gateway-access-gate";
import { gatewayMessage, gatewayRequest, jsonBody, MODEL_CATALOG_CHANGED } from "@/components/gateway/gateway-client";
import { Card } from "@/components/ui/card";
import { catalogModelKey, rememberCatalogModel } from "@/hooks/use-ai-provider";
import type {
  DiscoverModelsResult,
  GatewayConnection,
  ProviderType,
  TestConnectionResult,
} from "@/lib/gateway/contracts/connection";

type Connection = Omit<GatewayConnection, "secretRef"> & { hasCredential: boolean };

interface ModelProvidersViewProps {
  showBackButton?: boolean;
  onBack?: () => void;
}

const connectionUrl = "/api/gateway/connections";
const blankForm = { label: "", endpoint: "", apiKey: "" };
const variants = { active: "success", inactive: "neutral", testing: "info", error: "error", revoked: "warning" } as const;
const knownProviders: Record<string, ProviderType> = {
  "api.openai.com": "openai",
  "api.groq.com": "groq",
  "openrouter.ai": "openrouter",
  "api.deepseek.com": "deepseek",
  "api.together.xyz": "together",
};

export function ModelProvidersView({ showBackButton = true, onBack }: ModelProvidersViewProps) {
  const router = useRouter();
  const access = useGatewayAccess();
  const canManage = access?.roles?.includes("owner") ?? false;
  const [connections, setConnections] = useState<Connection[]>();
  const [editing, setEditing] = useState<Connection | "new">();
  const [form, setForm] = useState(blankForm);
  const [pending, setPending] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<Connection>();
  const [test, setTest] = useState<{ id: string; result: TestConnectionResult }>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const activeRequest = useRef<AbortController | null>(null);

  async function refresh(signal?: AbortSignal) {
    const response = await gatewayRequest<{ connections: Connection[] }>(connectionUrl, { signal });
    if (!signal?.aborted) setConnections(response.connections);
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => refresh(controller.signal)).catch((error) => {
      if (!controller.signal.aborted) setError(gatewayMessage(error, "Could not load saved connections."));
    });
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
    } catch (error) {
      if (!controller.signal.aborted) setError(gatewayMessage(error, "Could not complete the provider request. Try again."));
    } finally {
      activeRequest.current = null;
      if (!controller.signal.aborted) setPending(undefined);
    }
  }

  function openEditor(connection: Connection | "new") {
    setEditing(connection);
    setError(undefined);
    setForm(connection === "new" ? blankForm : { label: connection.label, endpoint: connection.endpoint, apiKey: "" });
  }

  function closeEditor() {
    setEditing(undefined);
    setForm(blankForm);
    setError(undefined);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || !form.label.trim() || !form.endpoint.trim()) return;
    const changes = {
      label: form.label.trim(),
      endpoint: form.endpoint.trim(),
      ...(form.apiKey.trim() && { apiKey: form.apiKey.trim() }),
    };
    await perform("save", async (signal) => {
      if (editing === "new") {
        const endpoint = new URL(changes.endpoint);
        const providerType = knownProviders[endpoint.hostname] ?? "custom";
        await gatewayRequest(connectionUrl, { method: "POST", signal, ...jsonBody({ ...changes, providerType }) });
      } else {
        await gatewayRequest(connectionUrl + "/" + encodeURIComponent(editing.id), { method: "PATCH", signal, ...jsonBody(changes) });
      }
      closeEditor();
      window.dispatchEvent(new Event(MODEL_CATALOG_CHANGED));
      setNotice("Connection saved. Test it and discover its models to use it in Chat.");
      await refresh(signal);
    });
  }

  async function connectionAction(id: string, action: "test" | "discover") {
    await perform(action + ":" + id, async (signal) => {
      const path = connectionUrl + "/" + encodeURIComponent(id) + "/" + action;
      if (action === "test") {
        setTest(undefined);
        const result = await gatewayRequest<TestConnectionResult>(path, { method: "POST", signal });
        if (!signal.aborted) setTest({ id, result });
      } else {
        const result = await gatewayRequest<DiscoverModelsResult>(path, { method: "POST", signal });
        const firstModel = result.models[0];
        if (firstModel) rememberCatalogModel(catalogModelKey(id, firstModel.id));
        window.dispatchEvent(new Event(MODEL_CATALOG_CHANGED));
        setNotice(firstModel
          ? "Discovered " + result.models.length + " models. Selected " + firstModel.name + " for Chat."
          : "The provider returned no eligible models.");
      }
      await refresh(signal);
    });
  }

  async function revoke(connection: Connection) {
    await perform("revoke", async (signal) => {
      await gatewayRequest(connectionUrl + "/" + encodeURIComponent(connection.id), { method: "DELETE", signal });
      setConnections((current) => current?.filter((item) => item.id !== connection.id));
      window.dispatchEvent(new Event(MODEL_CATALOG_CHANGED));
      setNotice("Connection revoked.");
    });
  }

  return (
    <Layout
      height="fill"
      contentWidth={860}
      padding={4}
      content={
        <LayoutContent>
          <div className="flex flex-col gap-5 text-neutral-900">
            {showBackButton && (
              <div>
                <DashboardButton variant="secondary" size="sm" onClick={onBack ?? router.back}>
                  <ArrowLeft className="mr-1 size-3.5" /> Back
                </DashboardButton>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Server className="size-4" /> Model providers
                </h2>
                <p className="text-xs text-neutral-600">
                  {canManage ? "Save a provider, test the connection, then discover models for Chat." : "Workspace owners manage provider connections."}
                </p>
              </div>
              {canManage && !editing && (
                <DashboardButton variant="secondary" size="sm" onClick={() => openEditor("new")}>
                  <Plus className="mr-1 size-3.5" /> Add Connection
                </DashboardButton>
              )}
            </div>

            {error && (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {error}
                {!connections && (
                  <DashboardButton size="sm" variant="secondary" onClick={() => void perform("refresh", refresh)} disabled={!!pending}>
                    Retry
                  </DashboardButton>
                )}
              </div>
            )}
            {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
            {!connections && !error && <p role="status" className="text-sm text-neutral-600">Loading providers…</p>}
            {connections?.length === 0 && <p className="text-sm text-neutral-600">No provider connections have been configured.</p>}

            {editing && (
              <Card className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" />{editing === "new" ? "New connection" : "Edit connection"}</h3>
                <form className="space-y-3" onSubmit={save}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput label="Connection label" value={form.label} onChange={(label) => setForm((current) => ({ ...current, label }))} isRequired />
                    <TextInput label="Provider base URL" type="url" value={form.endpoint} onChange={(endpoint) => setForm((current) => ({ ...current, endpoint }))} isRequired />
                  </div>
                  <TextInput
                    label={editing === "new" ? "Provider API key" : "Replacement API key"}
                    type="password"
                    autoComplete="off"
                    value={form.apiKey}
                    onChange={(apiKey) => setForm((current) => ({ ...current, apiKey }))}
                    description={editing !== "new" && editing.hasCredential ? "Leave empty to keep the saved credential when its provider URL stays the same." : undefined}
                    isOptional
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <DashboardButton type="button" variant="secondary" size="sm" onClick={closeEditor} disabled={!!pending}>Cancel</DashboardButton>
                    <DashboardButton type="submit" size="sm" disabled={!!pending || !form.label.trim() || !form.endpoint.trim()}>
                      {pending === "save" ? "Saving…" : "Save Connection"}
                    </DashboardButton>
                  </div>
                </form>
              </Card>
            )}

            <ul className="grid gap-3">
              {connections?.map((connection) => (
                <li key={connection.id}>
                  <Card className="space-y-3 rounded-xl border border-neutral-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">{connection.label}</h3>
                          <Badge label={connection.status} variant={variants[connection.status]} />
                          {connection.hasCredential && <Badge label="Credential saved" variant="neutral" />}
                        </div>
                        <p className="break-all text-xs text-neutral-600">{connection.endpoint}</p>
                        <p className="text-xs text-neutral-600">
                          {connection.eligibleModels.length} eligible models
                          {connection.lastTestedAt && " · Last tested " + new Date(connection.lastTestedAt).toLocaleString()}
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex flex-wrap gap-2">
                          <DashboardButton variant="secondary" size="sm" onClick={() => void connectionAction(connection.id, "test")} disabled={!!pending}>
                            <RefreshCw className="mr-1 size-3.5" />{pending === "test:" + connection.id ? "Testing…" : "Test"}
                          </DashboardButton>
                          <DashboardButton variant="secondary" size="sm" onClick={() => void connectionAction(connection.id, "discover")} disabled={!!pending}>
                            {pending === "discover:" + connection.id ? "Discovering…" : "Discover"}
                          </DashboardButton>
                          <DashboardButton variant="secondary" size="sm" onClick={() => openEditor(connection)} disabled={!!pending}>Edit</DashboardButton>
                          <DashboardButton variant="secondary" size="sm" onClick={() => setDeleteTarget(connection)} disabled={!!pending}>Revoke</DashboardButton>
                        </div>
                      )}
                    </div>
                    {test?.id === connection.id && (
                      <p role={test.result.success ? "status" : "alert"} className={test.result.success ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>
                        {test.result.message}
                      </p>
                    )}
                    {test?.id !== connection.id && connection.lastError && (
                      <p className="text-xs text-rose-700">{connection.lastError}</p>
                    )}
                    {connection.eligibleModels.length > 0 && (
                      <details className="text-xs text-neutral-600">
                        <summary className="cursor-pointer">Eligible models</summary>
                        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                          {connection.eligibleModels.map((model) => <li className="break-all font-mono" key={model}>{model}</li>)}
                        </ul>
                      </details>
                    )}
                  </Card>
                </li>
              ))}
            </ul>

            <DashboardConfirmDialog
              open={!!deleteTarget}
              onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
              title={"Revoke " + (deleteTarget?.label ?? "this connection") + "?"}
              description="Its models will disappear from Chat and its saved credential will be deleted."
              confirmLabel="Revoke connection"
              tone="danger"
              onConfirm={() => { if (deleteTarget) void revoke(deleteTarget); }}
            />
          </div>
        </LayoutContent>
      }
    />
  );
}
