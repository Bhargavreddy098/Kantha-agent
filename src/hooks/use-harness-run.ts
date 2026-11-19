"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gatewayRequest, gatewayMessage } from "@/lib/gateway/client";
import type { GatewayEvent } from "@/lib/gateway/contracts/event";
import type { RunSnapshot } from "@/lib/gateway/contracts/run";
import type { HarnessRunView } from "@/lib/harness/contracts";
import {
  cancelHarnessRun,
  getHarnessRun,
  recoverHarnessRuns,
  submitHarnessRun,
  type HarnessSubmitInput,
} from "@/lib/harness/client";

/** Subscribes to the existing gateway SSE feed and repaints from the harness projection. */
export function useHarnessRun(sessionId: string | undefined) {
  const [runId, setRunId] = useState<string>();
  const [view, setView] = useState<HarnessRunView | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const seen = useRef(new Set<string>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async (target?: string, signal?: AbortSignal) => {
    const id = target ?? runId;
    if (!id) return;
    try {
      const next = await getHarnessRun(id, signal);
      if (!signal?.aborted) {
        setView(next);
        setError(undefined);
      }
    } catch (err: unknown) {
      if (!signal?.aborted) setError(gatewayMessage(err, "Could not refresh the harness run."));
    }
  }, [runId]);

  useEffect(() => {
    if (!sessionId || !runId) return;
    const controller = new AbortController();
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let cursor = 0;
    seen.current.clear();

    const schedule = () => {
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = undefined;
        void refresh(runId, controller.signal);
      }, 200);
    };

    const connect = async () => {
      try {
        const snapshot = await gatewayRequest<RunSnapshot>(
          `/api/gateway/sessions/${encodeURIComponent(sessionId)}`,
          { signal: controller.signal },
        );
        cursor = snapshot.watermark;
      } catch {
        // The feed itself recovers an expired cursor; keep the local cursor at zero.
      }
      if (controller.signal.aborted) return;
      const query = new URLSearchParams({ sessionId, cursor: String(cursor) });
      source = new EventSource(`/api/gateway/events?${query.toString()}`);
      source.onopen = () => setConnecting(false);
      source.onerror = () => {
        source?.close();
        if (controller.signal.aborted || retryTimer) return;
        setConnecting(true);
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          void connect();
        }, 1200);
      };
      source.onmessage = (message) => {
        let event: GatewayEvent;
        try {
          event = JSON.parse(message.data) as GatewayEvent;
        } catch {
          return;
        }
        if (event.type === "resync.requested") {
          source?.close();
          void connect();
          return;
        }
        if (event.sessionId !== sessionId || event.sequence <= cursor) return;
        cursor = event.sequence;
        if (event.runId && event.runId !== runId) return;

        if (event.type.startsWith("harness.")) {
          const sourceEventId = (event.data as { sourceEventId?: string }).sourceEventId;
          if (sourceEventId && seen.current.has(sourceEventId)) return;
          if (sourceEventId) seen.current.add(sourceEventId);
          schedule();
        } else if (event.type === "run.state_changed" || event.type === "run.completed" ||
          event.type === "run.failed" || event.type === "run.cancelled") {
          schedule();
        }
      };
    };

    void connect();
    void refresh(runId, controller.signal);

    return () => {
      controller.abort();
      source?.close();
      if (retryTimer) clearTimeout(retryTimer);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [sessionId, runId, refresh]);

  const start = useCallback(async (input: HarnessSubmitInput) => {
    setBusy(true);
    setConnecting(true);
    setError(undefined);
    try {
      const result = await submitHarnessRun(input);
      setRunId(result.runId);
      await refresh(result.runId);
      return result;
    } catch (err: unknown) {
      setError(gatewayMessage(err, "Could not submit the harness task."));
      throw err;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const stop = useCallback(async () => {
    if (!runId) return;
    setBusy(true);
    try {
      await cancelHarnessRun(runId);
      await refresh(runId);
    } catch (err: unknown) {
      setError(gatewayMessage(err, "Could not stop the harness run."));
    } finally {
      setBusy(false);
    }
  }, [runId, refresh]);

  const recover = useCallback(async () => {
    try {
      const result = await recoverHarnessRuns();
      await refresh();
      return result;
    } catch (err: unknown) {
      setError(gatewayMessage(err, "Could not recover harness runs."));
      throw err;
    }
  }, [refresh]);

  return { runId, view, connecting, busy, error, start, stop, recover, refresh };
}
