"use client";

import NextLink from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useGatewayAccess } from "@/components/gateway/gateway-access-gate";
import { catalogModelKey, rememberCatalogModel } from "@/hooks/use-ai-provider";
import { gatewayMessage, gatewayRequest, jsonBody, MODEL_CATALOG_CHANGED } from "@/lib/gateway/client";
import type { DiscoverModelsResult, GatewayConnection, ProviderType, TestConnectionResult } from "@/lib/gateway/contracts/connection";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { Selector } from "@astryxdesign/core/Selector";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";

const path = "/api/gateway/connections";
const presets: Record<ProviderType, { label: string; endpoint: string }> = {
  openai: { label: "OpenAI", endpoint: "https://api.openai.com/v1" },
  anthropic: { label: "Anthropic", endpoint: "https://api.anthropic.com/v1" },
  groq: { label: "Groq", endpoint: "https://api.groq.com/openai/v1" },
  openrouter: { label: "OpenRouter", endpoint: "https://openrouter.ai/api/v1" },
  ollama: { label: "Ollama", endpoint: "http://localhost:11434/v1" },
  deepseek: { label: "DeepSeek", endpoint: "https://api.deepseek.com/v1" },
  together: { label: "Together AI", endpoint: "https://api.together.xyz/v1" },
  custom: { label: "Custom OpenAI-compatible", endpoint: "" },
};
const options = Object.entries(presets).map(([value, { label }]) => ({ value, label }));
const blank = { providerType: "custom" as ProviderType, label: "", endpoint: "", apiKey: "", models: "" };
const urlFor = (id: string) => path + "/" + encodeURIComponent(id);
const statusVariant = { active: "success", testing: "info", error: "error", inactive: "neutral", revoked: "neutral" } as const;

export function ModelProviders({ embedded = false }: { embedded?: boolean }) {
  const access = useGatewayAccess();
  return access?.roles?.includes("owner") ? <ProviderManager embedded={embedded} /> : (
    <EmptyState headingLevel={embedded ? 2 : 1} title="Model providers" description="Workspace owners manage provider connections." />
  );
}

function ProviderManager({ embedded = false }: { embedded?: boolean }) {
  const [connections, setConnections] = useState<GatewayConnection[]>();
  const [editor, setEditor] = useState<GatewayConnection | "new">();
  const [form, setForm] = useState(blank);
  const [pending, setPending] = useState<string | undefined>("refresh");
  const [revokeTarget, setRevokeTarget] = useState<GatewayConnection>();
  const [test, setTest] = useState<{ id: string; result: TestConnectionResult }>();
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const request = useRef<AbortController | undefined>(undefined);
  const editorHeading = useRef<HTMLHeadingElement>(null);

  async function refresh(signal: AbortSignal) {
    const result = await gatewayRequest<{ connections: GatewayConnection[] }>(path, { signal });
    if (!signal.aborted) setConnections(result.connections);
  }

  async function perform(operation: string, action: (signal: AbortSignal) => Promise<void>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError(undefined);
    setPending(operation);
    try {
      await action(controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = gatewayMessage(cause, "The provider request could not be completed. Try again.");
        if (operation === "save") setFormError(message);
        else setError(message);
      }
    } finally {
      if (request.current === controller) request.current = undefined;
      if (!controller.signal.aborted) setPending(undefined);
    }
  }

  useEffect(() => {
    const initial = setTimeout(() => void perform("refresh", refresh), 0);
    return () => {
      clearTimeout(initial);
      request.current?.abort();
      request.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (editor) editorHeading.current?.focus();
  }, [editor]);

  function openEditor(connection?: GatewayConnection) {
    setFormError(undefined);
    setEditor(connection ?? "new");
    setForm(connection ? {
      label: connection.label,
      providerType: connection.providerType,
      endpoint: connection.endpoint,
      apiKey: "",
      models: connection.eligibleModels.join(", "),
    } : blank);
  }

  function changeProvider(value: string) {
    const providerType = value as ProviderType;
    const preset = presets[providerType];
    if (!preset) return;
    setForm({ ...blank, providerType, label: providerType === "custom" ? "" : preset.label, endpoint: preset.endpoint });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || pending) return;
    setFormError(undefined);
    const label = form.label.trim();
    const endpoint = form.endpoint.trim();
    const apiKey = form.apiKey.trim();
    const eligibleModels = [...new Set(form.models.split(",").map((id) => id.trim()).filter(Boolean))];
    if (!label || !endpoint) {
      setFormError("Enter a connection name and base URL.");
      return;
    }

    const existing = editor === "new" ? undefined : editor;
    const modelsChanged = !existing || form.models !== existing.eligibleModels.join(", ");
    const payload = {
      label,
      providerType: form.providerType,
      ...(endpoint !== existing?.endpoint && { endpoint }),
      ...(apiKey && { apiKey }),
      ...(modelsChanged && { eligibleModels }),
    };
    await perform("save", async (signal) => {
      const connection = await gatewayRequest<GatewayConnection>(existing ? urlFor(existing.id) : path, {
        method: existing ? "PATCH" : "POST",
        signal,
        ...jsonBody(payload),
      });
      if (signal.aborted) return;
      setConnections((current) => existing
        ? (current ?? []).map((item) => item.id === connection.id ? connection : item)
        : [connection, ...(current ?? [])]);
      setNotice(connection.label + " saved.");
      setTest(undefined);
      setForm(blank);
      setEditor(undefined);
      window.dispatchEvent(new Event(MODEL_CATALOG_CHANGED));
    });
  }

  function runAction(connection: GatewayConnection, action: "test" | "discover") {
    setNotice(undefined);
    if (action === "test") setTest(undefined);
    void perform(action + connection.id, async (signal) => {
      const endpoint = urlFor(connection.id) + "/" + action;
      if (action === "test") {
        const result = await gatewayRequest<TestConnectionResult>(endpoint, { method: "POST", signal, ...jsonBody({}) });
        if (!signal.aborted) setTest({ id: connection.id, result });
      } else {
        const result = await gatewayRequest<DiscoverModelsResult>(endpoint, { method: "POST", signal, ...jsonBody({}) });
        if (signal.aborted) return;
        setNotice(result.models.length
          ? "Discovered " + result.models.length + " eligible models for " + connection.label + "."
          : connection.label + " returned no eligible chat models.");
        window.dispatchEvent(new Event(MODEL_CATALOG_CHANGED));
      }
      await refresh(signal);
    });
  }

  async function revoke() {
    if (!revokeTarget) return;
    const target = revokeTarget;
    await perform("revoke", async (signal) => {
      const revoked = await gatewayRequest<GatewayConnection>(urlFor(target.id), {
        method: "PATCH", signal, ...jsonBody({ status: "revoked" }),
      });
      if (signal.aborted) return;
      setConnections((current) => current?.map((item) => item.id === target.id ? revoked : item));
      setTest(undefined);
      setNotice(target.label + " revoked.");
      window.dispatchEvent(new Event(MODEL_CATALOG_CHANGED));
    });
    setRevokeTarget(undefined);
  }

  const content = (
    <>
      <Stack direction="horizontal" align="center" justify="between" wrap="wrap" gap={3}>
        <Heading level={embedded ? 2 : 1}>Model providers</Heading>
        <Button label="Add provider" variant="primary" isDisabled={Boolean(editor || pending)} onClick={() => openEditor()} />
      </Stack>
      {notice && <Banner status="success" role="status" title={notice} />}
      {error && <Banner status="error" role="alert" title={error} endContent={
        <Button label="Refresh connections" variant="secondary" size="sm" onClick={() => void perform("refresh", refresh)} />
      } />}

      {editor && (
        <Card padding={4}>
          <VStack gap={3}>
            <Heading level={2} ref={editorHeading} tabIndex={-1}>{editor === "new" ? "Add a provider" : "Edit " + editor.label}</Heading>
            <form onSubmit={save}>
              <FormLayout>
                <Selector label="Provider type" options={options} value={form.providerType}
                  onChange={changeProvider} isDisabled={editor !== "new" || Boolean(pending)} />
                <TextInput label="Connection name" value={form.label} isRequired isDisabled={Boolean(pending)}
                  onChange={(label) => setForm((current) => ({ ...current, label }))} />
                <TextInput label="Base URL" value={form.endpoint} isRequired isDisabled={Boolean(pending)}
                  placeholder="https://provider.example/v1"
                  onChange={(endpoint) => setForm((current) => ({ ...current, endpoint }))} />
                <TextInput label="API key" type="password" autoComplete="off" value={form.apiKey}
                  isDisabled={Boolean(pending)}
                  description={editor !== "new" && editor.hasCredential
                    ? "Leave blank to keep the saved key for the same URL. Changing the URL clears the saved key unless you enter a replacement."
                    : "Enter a key if this provider requires one."}
                  onChange={(apiKey) => setForm((current) => ({ ...current, apiKey }))} />
                <TextInput label="Model IDs" value={form.models} isDisabled={Boolean(pending)}
                  description="Enter comma-separated model IDs or discover them after saving."
                  onChange={(models) => setForm((current) => ({ ...current, models }))} />
                {formError && <Banner status="error" role="alert" title={formError} />}
                <Stack direction="horizontal" gap={2} wrap="wrap">
                  <Button type="submit" label="Save connection" isLoading={pending === "save"} variant="primary" />
                  <Button label="Cancel" variant="secondary" isDisabled={Boolean(pending)}
                    onClick={() => { setEditor(undefined); setForm(blank); }} />
                </Stack>
              </FormLayout>
            </form>
          </VStack>
        </Card>
      )}

      {!connections && !error && <Text role="status">Loading provider connections…</Text>}
      {connections?.length === 0 && !editor && (
        <EmptyState headingLevel={2} title="No provider connections"
          description="Add a connection to discover models and make them available in Chat." />
      )}
      {connections?.map((item) => {
        const isRevoked = item.status === "revoked";
        const testResult = test?.id === item.id ? test.result : undefined;
        return (
          <Card key={item.id} padding={4}>
            <VStack gap={3}>
              <Stack direction="horizontal" align="center" gap={2} wrap="wrap">
                <Heading level={2}>{item.label}</Heading>
                <Badge variant={statusVariant[item.status]} label={item.status} />
              </Stack>
              <Text as="p" wordBreak="break-word">{item.endpoint}</Text>
              <Text>{item.hasCredential ? "API key saved" : "No API key saved"}</Text>
              {item.lastTestedAt && <Text>Last tested {new Date(item.lastTestedAt).toLocaleString()}</Text>}
              {testResult && <Banner status={testResult.success ? "success" : "error"} role="status"
                title={testResult.success ? "Connection test passed" : "Connection test failed"}
                description={testResult.message + " (" + testResult.latencyMs + " ms)"} />}
              {!testResult && item.lastError && <Banner status="warning" title={item.lastError} />}
              {!isRevoked && (
                <Stack direction="horizontal" gap={2} wrap="wrap">
                  <Button label="Edit" variant="secondary" isDisabled={Boolean(pending || editor)} onClick={() => openEditor(item)} />
                  <Button label="Test connection" variant="secondary" isDisabled={Boolean(pending || editor)}
                    isLoading={pending === "test" + item.id} onClick={() => runAction(item, "test")} />
                  <Button label="Discover models" variant="secondary" isDisabled={Boolean(pending || editor)}
                    isLoading={pending === "discover" + item.id} onClick={() => runAction(item, "discover")} />
                  <Button label="Revoke" variant="ghost" isDisabled={Boolean(pending || editor)} onClick={() => setRevokeTarget(item)} />
                </Stack>
              )}
              {item.eligibleModels.length > 0 && (
                <Collapsible defaultIsOpen={false} trigger={<Text>{item.eligibleModels.length} eligible models</Text>}>
                  <VStack gap={2} paddingBlock={2}>
                    {item.eligibleModels.map((model) => (
                      <Stack key={model} direction="horizontal" align="center" gap={2} wrap="wrap">
                        <Text wordBreak="break-word">{model}</Text>
                        {item.status === "active" && (
                          <Button label="Use in Chat" aria-label={"Use " + model + " in Chat"}
                            href="/chat" as={NextLink} size="sm" variant="ghost"
                            onClick={() => rememberCatalogModel(catalogModelKey(item.id, model))} />
                        )}
                      </Stack>
                    ))}
                  </VStack>
                </Collapsible>
              )}
            </VStack>
          </Card>
        );
      })}
      <AlertDialog isOpen={Boolean(revokeTarget)} onOpenChange={(open) => { if (!open && !pending) setRevokeTarget(undefined); }}
        title="Revoke provider connection?" description="This removes the saved credential and makes the provider’s models unavailable in Chat."
        actionLabel="Revoke connection" actionVariant="destructive" isActionLoading={pending === "revoke"} onAction={revoke} />
    </>
  );
  return embedded
    ? <VStack gap={4}>{content}</VStack>
    : <Stack maxWidth={900} gap={5} padding={4}>{content}</Stack>;
}
