"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GatewayEvent, RunStateChangedPayload } from "@/lib/gateway/contracts/event";
import type { GatewayApproval } from "@/lib/gateway/contracts/approval";
import type { GatewayRun, RunSnapshot, RunStatus } from "@/lib/gateway/contracts/run";
import { gatewayMessage, gatewayRequest, GatewayRequestError, jsonBody } from "@/lib/gateway/client";

function isTerminal(status: RunStatus): boolean {
  return status === "completed" || status === "cancelled" || status === "failed" || status === "interrupted";
}

export function useGatewayEvents(
  sessionId: string | undefined,
  onSnapshot: (snapshot: RunSnapshot) => void,
) {
  const [run, setRun] = useState<GatewayRun | null>(null);
  const [approval, setApproval] = useState<GatewayApproval | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();
  const [loadedSession, setLoadedSession] = useState<string>();
  const snapshotCallback = useRef(onSnapshot);
  const reload = useRef<() => Promise<RunSnapshot | undefined>>(async () => undefined);

  useEffect(() => {
    snapshotCallback.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingPromise: Promise<RunSnapshot | undefined> | undefined;
    let cursor = 0;
    const path = `/api/gateway/sessions/${encodeURIComponent(sessionId)}`;

    const executeRefresh = async (): Promise<RunSnapshot | undefined> => {
      try {
        const snapshot = await gatewayRequest<RunSnapshot>(path, { signal: controller.signal });
        if (controller.signal.aborted) return undefined;

        setRun(snapshot.run);
        setLoadedSession(sessionId);
        setError(undefined);

        setApproval((previous) => {
          if (snapshot.pendingApproval) {
            if (
              previous?.id === snapshot.pendingApproval.id &&
              previous.status !== "waiting" &&
              snapshot.pendingApproval.status === "waiting"
            ) {
              return previous;
            }
            return snapshot.pendingApproval;
          }
          return previous?.sessionId === sessionId && previous.runId === snapshot.run?.id ? previous : null;
        });

        snapshotCallback.current(snapshot);
        return snapshot;
      } catch (err: unknown) {
        if (controller.signal.aborted) return undefined;
        setLoadedSession(sessionId);

        if (err instanceof GatewayRequestError && err.status === 404) {
          setRun(null);
          setApproval(null);
          setError("This conversation is unavailable. Start a new conversation to continue.");
        } else {
          setError(gatewayMessage(err, "Could not refresh this conversation."));
        }
        throw err;
      } finally {
        pendingPromise = undefined;
      }
    };

    const refresh = async (): Promise<RunSnapshot | undefined> => {
      if (controller.signal.aborted) return undefined;
      if (pendingPromise) return pendingPromise;
      pendingPromise = executeRefresh();
      return pendingPromise;
    };

    reload.current = refresh;

    const scheduleSnapshot = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        const currentPending = pendingPromise;
        void (async () => {
          try {
            await currentPending;
          } catch {
            // Suppress prior refresh error during scheduled retry
          }
          try {
            await refresh();
          } catch {
            // Suppress refresh errors during debounced snapshot schedule
          }
        })();
      }, 350);
    };

    const reconnect = () => {
      source?.close();
      if (retryTimer) return;
      setConnecting(true);
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, 1500);
    };

    const connect = async () => {
      try {
        const snapshot = await refresh();
        if (!snapshot || controller.signal.aborted) return;
        cursor = snapshot.watermark;
      } catch (err) {
        const isTerminalError =
          err instanceof GatewayRequestError && (err.status === 401 || err.status === 403 || err.status === 404);
        if (!controller.signal.aborted && !isTerminalError) {
          reconnect();
        }
        return;
      }

      const query = new URLSearchParams({ sessionId, cursor: String(cursor) });
      source = new EventSource(`/api/gateway/events?${query.toString()}`);
      source.onopen = () => setConnecting(false);
      source.onerror = reconnect;
      source.onmessage = (message) => {
        let event: GatewayEvent;
        try {
          event = JSON.parse(message.data);
        } catch {
          return;
        }

        if (event.type === "resync.requested") {
          reconnect();
          return;
        }

        if (event.sessionId !== sessionId || event.sequence <= cursor) return;
        cursor = event.sequence;

        if (event.type === "run.state_changed") {
          const { newState } = event.data as RunStateChangedPayload;
          if (newState && event.runId) {
            const runId = event.runId;
            setRun((current) => (current?.id === runId ? { ...current, status: newState } : current));
          }
          scheduleSnapshot();
        }

        if (event.type === "approval.requested") {
          setApproval(event.data as GatewayApproval);
          scheduleSnapshot();
        }

        if (event.type === "approval.resolved") {
          setApproval(null);
          scheduleSnapshot();
        }

        if (event.type === "run.completed") {
          setRun((current) => (current ? { ...current, status: "completed" } : current));
          scheduleSnapshot();
        }

        if (event.type === "run.cancelled") {
          setRun((current) => (current ? { ...current, status: "cancelled" } : current));
          scheduleSnapshot();
        }

        if (event.type === "run.failed") {
          setRun((current) => (current ? { ...current, status: "failed" } : current));
          scheduleSnapshot();
        }

        if (event.type === "run.delta") {
          scheduleSnapshot();
        }
      };
    };

    void connect();

    return () => {
      controller.abort();
      source?.close();
      if (retryTimer) clearTimeout(retryTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      reload.current = async () => undefined;
    };
  }, [sessionId]);

  const approvalId = approval?.id;
  const approvalSession = approval?.sessionId;
  const approvalStatus = approval?.status;
  const approvalExpiry = approval?.expiresAt;

  useEffect(() => {
    if (!approvalId || !approvalExpiry || approvalStatus !== "waiting" || approvalSession !== sessionId) {
      return;
    }

    const controller = new AbortController();
    const expiry = Math.max(Date.parse(approvalExpiry) - Date.now() + 200, 0);

    const timer = setTimeout(() => {
      const path = `/api/gateway/approvals/${encodeURIComponent(approvalId)}`;
      void (async () => {
        try {
          const latest = await gatewayRequest<GatewayApproval>(path, { signal: controller.signal });
          if (!controller.signal.aborted) {
            setApproval(latest);
          }
        } catch {
          // Polling expiry completed or aborted
        }
      })();
    }, expiry);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [approvalId, approvalExpiry, approvalSession, approvalStatus, sessionId]);

  const resolveApproval = useCallback(
    async (targetApprovalId: string, decision: "approve" | "reject", actionVersion: number) => {
      const path = `/api/gateway/approvals/${encodeURIComponent(targetApprovalId)}`;
      try {
        const decisionResult = await gatewayRequest<GatewayApproval>(path, {
          method: "POST",
          ...jsonBody({ decision, actionVersion }),
        });
        setApproval(decisionResult);
        try {
          await reload.current();
        } catch {
          // Suppress reload error on successful resolution
        }
      } catch (error) {
        let observed: GatewayApproval | undefined;
        try {
          observed = await gatewayRequest<GatewayApproval>(path);
        } catch {
          observed = undefined;
        }

        if (observed) {
          setApproval(observed);
        }

        try {
          await reload.current();
        } catch {
          // Suppress reload error
        }

        if (!observed || observed.status !== (decision === "approve" ? "approved" : "rejected")) {
          throw error;
        }
      }
    },
    [],
  );

  const cancel = useCallback(async (runId: string) => {
    const cancelled = await gatewayRequest<GatewayRun>(
      `/api/gateway/runs/${encodeURIComponent(runId)}/cancel`,
      {
        method: "POST",
        ...jsonBody({ reason: "Cancelled from Chat" }),
      },
    );
    setRun(cancelled);
    return cancelled;
  }, []);

  const refresh = useCallback(() => reload.current(), []);

  return {
    run: run?.sessionId === sessionId ? run : null,
    approval: approval?.sessionId === sessionId ? approval : null,
    loading: Boolean(sessionId && loadedSession !== sessionId),
    reconnecting: Boolean(sessionId && connecting && (!run || !isTerminal(run.status))),
    error: sessionId ? error : undefined,
    refresh,
    rememberApproval: setApproval,
    resolveApproval,
    cancel,
  };
}
