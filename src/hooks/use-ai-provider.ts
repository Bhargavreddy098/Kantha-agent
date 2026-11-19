"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { gatewayMessage, gatewayRequest, MODEL_CATALOG_CHANGED } from "@/lib/gateway/client";
import type { ChatModelCatalog } from "@/types/chat";

interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  connectionId: string;
}

const SELECTION_KEY = "kantha:gateway-model";

function modelKey(model: CatalogModel) {
  return catalogModelKey(model.connectionId, model.id);
}

export function catalogModelKey(connectionId: string, modelId: string) {
  return JSON.stringify([connectionId, modelId]);
}

export function rememberCatalogModel(key: string) {
  try {
    sessionStorage.setItem(SELECTION_KEY, key);
  } catch {
    // Model selection remains available without storage.
  }
}

export function useAIProvider() {
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [selection, setSelection] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setLoading(true);
      try {
        const { data = [] } = await gatewayRequest<ChatModelCatalog>("/api/chat/models", { signal: request.signal });
        if (request.signal.aborted) return;
        setModels(data);
        setError(undefined);
        try {
          const saved = sessionStorage.getItem(SELECTION_KEY) || undefined;
          setSelection(saved);
        } catch {
          // Model selection remains available without storage.
        }
      } catch (error) {
        if (request.signal.aborted) return;
        setModels([]);
        setError(gatewayMessage(error, "Could not load workspace models."));
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    };

    void refresh();
    window.addEventListener(MODEL_CATALOG_CHANGED, refresh);
    return () => {
      controller?.abort();
      window.removeEventListener(MODEL_CATALOG_CHANGED, refresh);
    };
  }, []);

  const setSelectedModel = useCallback((key: string) => {
    setSelection(key);
    rememberCatalogModel(key);
  }, []);

  const selected = useMemo(
    () => models.find((model) => modelKey(model) === selection) ?? models[0],
    [models, selection],
  );

  const modelOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of models) counts.set(model.id, (counts.get(model.id) ?? 0) + 1);
    const occurrences = new Map<string, number>();
    return models.map((model) => {
      const ordinal = (occurrences.get(model.id) ?? 0) + 1;
      occurrences.set(model.id, ordinal);
      const label =
        (counts.get(model.id) ?? 0) > 1
          ? `${model.name} (${model.provider} · ${ordinal})`
          : model.name;
      return { value: modelKey(model), label };
    });
  }, [models]);

  return { selected, selectedKey: selected && modelKey(selected), setSelectedModel, modelOptions, loading, error };
}
